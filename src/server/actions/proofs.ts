"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { canonicalJson } from "@/domain/canonical";
import { designDocumentSchema } from "@/domain/design/schema";
import { getSessionUser } from "@/server/auth";
import { designConfigSchema } from "@/server/designs";
import { errorCode, generateProof, notifyProofApproved, proofErrorMessage } from "@/server/proofs";
import { resolveMerge, type ResolvedMerge } from "@/server/merge";
import { rateLimit } from "@/server/rate-limit";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export type ProofActionResult = { ok: true } | { ok: false; code: string; message: string };

const decisionSchema = z.object({
  orderId: z.string().uuid(),
  versionId: z.string().uuid(),
  version: z.number().int().positive(),
});

const changesSchema = decisionSchema.extend({
  comment: z.string().trim().min(1, "Tell us what to change.").max(2000),
});

const failure = (code: string, message = proofErrorMessage(code)): ProofActionResult => ({
  ok: false,
  code,
  message,
});

async function signedInCustomer(key: string) {
  const user = await getSessionUser();
  if (!user) return { user: null, error: failure("login_required", "Please log in again.") };
  if (!(await rateLimit(`${key}:${user.id}`, 20, 600, false))) {
    return { user: null, error: failure("rate_limited", "Too many attempts. Please wait.") };
  }
  return { user, error: null };
}

/** Where the decision came from, for the approval log (PRD p6 §08). */
async function requestOrigin() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = z.union([z.ipv4(), z.ipv6()]).safeParse(forwarded ?? h.get("x-real-ip"));
  return {
    p_ip: ip.success ? ip.data : undefined,
    p_user_agent: h.get("user-agent")?.slice(0, 500) ?? undefined,
  };
}

/**
 * Approve one proof version. The database checks, in one locked transaction, that this is the
 * customer's order, that it is waiting for a decision and that this version is the latest
 * pending one; then logs the approval, unlocks print files and locks the design.
 */
export async function approveProofAction(input: unknown): Promise<ProofActionResult> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return failure("proof_not_found");
  const { user, error } = await signedInCustomer("proof-decision");
  if (!user) return error;

  const { data, error: rpcError } = await createSupabaseAdminClient().rpc("approve_proof", {
    p_order_id: parsed.data.orderId,
    p_version_id: parsed.data.versionId,
    p_version: parsed.data.version,
    p_actor_id: user.id,
    ...(await requestOrigin()),
  });
  if (rpcError || !data) return failure(errorCode(rpcError?.message));
  await notifyProofApproved(parsed.data.orderId, parsed.data.version);
  return { ok: true };
}

/** Ask for changes to the latest proof: the comment is logged and the order returns to artwork. */
export async function requestProofChangesAction(input: unknown): Promise<ProofActionResult> {
  const parsed = changesSchema.safeParse(input);
  if (!parsed.success) {
    const comment = parsed.error.issues.find((i) => i.path[0] === "comment");
    return comment ? failure("comment_required", comment.message) : failure("proof_not_found");
  }
  const { user, error } = await signedInCustomer("proof-decision");
  if (!user) return error;

  const { data, error: rpcError } = await createSupabaseAdminClient().rpc("request_proof_changes", {
    p_order_id: parsed.data.orderId,
    p_version_id: parsed.data.versionId,
    p_version: parsed.data.version,
    p_actor_id: user.id,
    p_comment: parsed.data.comment,
    ...(await requestOrigin()),
  });
  if (rpcError || !data) return failure(errorCode(rpcError?.message));
  return { ok: true };
}

/**
 * After a change request: turn the customer's latest saved design into the next proof version.
 * The print configuration (size, material, quantity) must match what was paid for; a different
 * job needs a new order. The artwork is re-checked by the print engine before rendering.
 */
export async function submitRevisionAction(orderId: unknown): Promise<ProofActionResult> {
  const id = z.string().uuid().safeParse(orderId);
  if (!id.success) return failure("order_not_found");
  const { user, error } = await signedInCustomer("proof-revision");
  if (!user) return error;

  // Under RLS: only the customer's own order and design are visible.
  const supabase = await createSupabaseServerClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, approved_proof_id, order_items(product_id, design_id, config_snapshot)")
    .eq("id", id.data)
    .maybeSingle();
  const item = order?.order_items[0];
  if (!order || !item?.design_id) return failure("order_not_found");
  if (order.status !== "artwork" || order.approved_proof_id) {
    return failure("order_not_awaiting_proof");
  }
  const { data: latest } = await supabase
    .from("proof_versions")
    .select("status")
    .eq("order_id", order.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest?.status !== "changes_requested") return failure("order_not_awaiting_proof");

  const { data: design } = await supabase
    .from("designs")
    .select("product_id, config, document, data_merge")
    .eq("id", item.design_id)
    .maybeSingle();
  const document = designDocumentSchema.safeParse(design?.document);
  const config = designConfigSchema.safeParse(design?.config);
  if (!design || !document.success || !config.success) {
    return failure("artwork_invalid", "Your saved design could not be read. Save it again.");
  }
  // Variable data: the revised file is re-checked row by row; one item per row, as paid.
  let merge: ResolvedMerge | undefined;
  let revisedConfig = config.data;
  if (config.data.variableData) {
    const resolved = await resolveMerge(design.data_merge, user.id, document.data);
    if (!resolved.ok) return failure("artwork_invalid", resolved.error);
    const firstError = resolved.merge.check.issues.find((i) => i.severity === "error");
    if (firstError) return failure("artwork_invalid", `Fix your data file: ${firstError.message}`);
    merge = resolved.merge;
    revisedConfig = { ...config.data, quantity: merge.values.length };
  }
  if (
    design.product_id !== item.product_id ||
    canonicalJson(revisedConfig) !== canonicalJson(designConfigSchema.parse(item.config_snapshot))
  ) {
    return failure(
      "config_changed",
      config.data.variableData
        ? "The size, material or number of rows no longer matches this order. Keep the same number of rows to revise it, or place a new order."
        : "The size, material or quantity no longer matches this order. Change them back to revise this order, or place a new order.",
    );
  }

  const outcome = await generateProof({
    orderId: order.id,
    source: "customer_edit",
    actorId: user.id,
    document: document.data,
    ...(merge ? { merge } : {}),
  });
  return outcome.ok ? { ok: true } : failure(outcome.code, outcome.message);
}
