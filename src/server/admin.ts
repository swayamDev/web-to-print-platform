import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { designDocumentSchema } from "@/domain/design/schema";
import { placeArtwork } from "@/domain/design/document";
import { extensionOf } from "@/domain/uploads";
import { inspectUpload, MIME, previewPathFor, sha256, UPLOAD_PATH } from "@/server/assets";
import { orderCancelledEmail, orderCompletedEmail } from "@/server/email/templates";
import { serverEnv } from "@/server/env";
import { notifyCustomer } from "@/server/notify";
import { customerContact, generateProof } from "@/server/proofs";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

/**
 * Admin console operations (PRD p4 §03, p8 §11–12). Callers must have checked the admin role
 * (requireAdmin / role check); the database functions check it again.
 */

export type AdminResult = { ok: true; message: string } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  admin_required: "Only admins can do this.",
  order_not_found: "This order could not be found.",
  order_not_in_production: "Only orders in production can be marked complete.",
  order_cannot_be_cancelled: "Orders in production or already finished cannot be cancelled here.",
  reason_required: "Give a reason; it is sent to the customer.",
  order_not_finished: "Only completed or cancelled orders can be archived.",
  cannot_change_own_role: "You cannot change your own role.",
  last_admin: "This is the last admin; make someone else an admin first.",
  user_not_found: "This user could not be found.",
};

const fail = (message: string | undefined): AdminResult => {
  const code = Object.keys(MESSAGES).find((c) => message?.includes(c));
  return { ok: false, message: code ? MESSAGES[code]! : "Something went wrong. Please try again." };
};

export type OrderAction = "complete" | "cancel" | "archive" | "unarchive";

/** Complete, cancel, archive or unarchive an order (audited in the database). */
export async function runOrderAction(
  actorId: string,
  orderId: string,
  action: OrderAction,
  note: string | null,
): Promise<AdminResult> {
  const admin = createSupabaseAdminClient();
  const { data: before } = await admin
    .from("orders")
    .select("paid_at")
    .eq("id", orderId)
    .maybeSingle();
  const { data: order, error } = await admin.rpc("admin_order_action", {
    p_actor: actorId,
    p_order_id: orderId,
    p_action: action,
    ...(note ? { p_note: note } : {}),
  });
  if (error || !order) return fail(error?.message);

  if (action === "complete" || action === "cancel") {
    const customer = await customerContact(order.customer_id);
    const orderUrl = `${serverEnv().APP_URL}/account/orders/${order.id}`;
    await notifyCustomer({
      userId: order.customer_id,
      email: customer.email,
      orderId: order.id,
      type: action === "complete" ? "order_completed" : "order_cancelled",
      content:
        action === "complete"
          ? orderCompletedEmail({
              customerName: customer.name,
              orderNumber: order.order_number,
              orderUrl,
            })
          : orderCancelledEmail({
              customerName: customer.name,
              orderNumber: order.order_number,
              reason: note ?? "",
              paid: Boolean(before?.paid_at),
              orderUrl,
            }),
    });
  }
  const done: Record<OrderAction, string> = {
    complete: "Marked complete. The customer has been told.",
    cancel: "Order cancelled. The customer has been told; refund any payment in Stripe.",
    archive: "Archived.",
    unarchive: "Moved back to the active list.",
  };
  return { ok: true, message: done[action] };
}

/** Change a user's role (D-17); audited, never your own, never the last admin. */
export async function changeRole(
  actorId: string,
  targetId: string,
  role: "customer" | "admin",
): Promise<AdminResult> {
  const { error } = await createSupabaseAdminClient().rpc("admin_set_role", {
    p_actor: actorId,
    p_target: targetId,
    p_role: role,
  });
  if (error) return fail(error.message);
  return { ok: true, message: role === "admin" ? "Now an admin." : "Now a customer." };
}

export type DirectoryUser = {
  id: string;
  email: string;
  fullName: string | null;
  companyName: string | null;
  phone: string | null;
  role: "customer" | "admin";
  createdAt: string;
  orderCount: number;
  paidTotalMinor: number;
  lastOrderAt: string | null;
};

export const USERS_PER_PAGE = 50;

/** Users with their sign-in email and order totals, newest first. */
export async function userDirectory(
  actorId: string,
  options: { query?: string; role?: "customer" | "admin"; page?: number; limit?: number },
): Promise<{ users: DirectoryUser[]; total: number }> {
  const limit = options.limit ?? USERS_PER_PAGE;
  const { data, error } = await createSupabaseAdminClient().rpc("admin_user_directory", {
    p_actor: actorId,
    ...(options.query ? { p_query: options.query.slice(0, 100) } : {}),
    ...(options.role ? { p_role: options.role } : {}),
    p_limit: limit,
    p_offset: Math.max(0, (options.page ?? 1) - 1) * limit,
  });
  if (error) throw new Error(error.message);
  return {
    total: Number(data?.[0]?.total_count ?? 0),
    users: (data ?? []).map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      companyName: u.company_name,
      phone: u.phone,
      role: u.role,
      createdAt: u.created_at,
      orderCount: Number(u.order_count),
      paidTotalMinor: Number(u.paid_total_minor),
      lastOrderAt: u.last_order_at,
    })),
  };
}

// -----------------------------------------------------------------------------
// Corrected proofs uploaded by staff (source = admin_upload).

const PROOFABLE = ["artwork", "proof"] as const;

async function proofableOrder(orderId: string) {
  const { data: order } = await createSupabaseAdminClient()
    .from("orders")
    .select(
      "id, customer_id, status, approved_proof_id, order_items(is_variable_data, design_snapshot)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false as const, message: "This order could not be found." };
  if (!(PROOFABLE as readonly string[]).includes(order.status) || order.approved_proof_id) {
    return {
      ok: false as const,
      message: "A corrected proof can only be added before the customer approves one.",
    };
  }
  if (order.order_items[0]?.is_variable_data) {
    return {
      ok: false as const,
      message:
        "This order is personalised from a data file; ask the customer to correct the design instead.",
    };
  }
  return { ok: true as const, order };
}

/**
 * Step 1: a one-time upload URL into the customer's own folder (the file belongs to them,
 * like their own uploads, so the print engine can use it).
 */
export async function adminProofUploadUrl(
  orderId: string,
  filename: string,
): Promise<{ ok: true; path: string; token: string } | { ok: false; message: string }> {
  const found = await proofableOrder(orderId);
  if (!found.ok) return found;
  const ext = extensionOf(filename);
  if (!["pdf", "ai", "png", "jpg", "jpeg", "svg"].includes(ext)) {
    return { ok: false, message: "Upload a PDF, AI, SVG, PNG or JPEG file." };
  }
  const path = `${found.order.customer_id}/${randomUUID()}.${ext}`;
  const { data, error } = await createSupabaseAdminClient()
    .storage.from("uploads")
    .createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "The upload could not be started." };
  return { ok: true, path, token: data.token };
}

export const adminProofSchema = z.object({
  orderId: z.string().uuid(),
  path: z.string().regex(UPLOAD_PATH),
  filename: z.string().trim().min(1).max(200),
  note: z.string().trim().max(500).optional(),
});

/**
 * Step 2: check the uploaded file like any customer upload, place it as full-page artwork on
 * the order's page size, and create the next proof version from it. The customer then
 * approves or rejects it as usual.
 */
export async function createAdminProof(
  actorId: string,
  input: z.infer<typeof adminProofSchema>,
): Promise<AdminResult> {
  const found = await proofableOrder(input.orderId);
  if (!found.ok) return found;
  const { order } = found;
  const [, ownerId, assetId, ext] = UPLOAD_PATH.exec(input.path)!;
  if (ownerId !== order.customer_id)
    return { ok: false, message: "This upload is not for this order." };

  const admin = createSupabaseAdminClient();
  const storage = admin.storage.from("uploads");
  const { data: blob } = await storage.download(input.path);
  if (!blob) return { ok: false, message: "The upload did not arrive. Please try again." };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const reject = async (message: string): Promise<AdminResult> => {
    await storage.remove([input.path]);
    return { ok: false, message };
  };

  const inspected = await inspectUpload(
    bytes,
    `${input.filename.replace(/\.[^.]*$/, "")}.${ext}`,
    "artwork",
  );
  if (!inspected.ok) return reject(inspected.reason);
  let previewPath: string | null = null;
  if (inspected.preview) {
    previewPath = previewPathFor(input.path);
    const { error } = await storage.upload(previewPath, inspected.preview, {
      contentType: "image/png",
      upsert: true,
    });
    if (error) return reject("We could not prepare a preview of this file.");
  }
  const { error: insertError } = await admin.from("assets").insert({
    id: assetId,
    owner_id: order.customer_id,
    bucket: "uploads",
    path: input.path,
    kind: "artwork",
    original_filename: input.filename,
    mime_type: MIME[inspected.format],
    bytes: bytes.length,
    sha256: sha256(bytes),
    width_px: inspected.widthPx,
    height_px: inspected.heightPx,
    page_count: inspected.pageCount,
    page_size_mm: inspected.pageSizeMm,
    status: "valid",
    validation: {
      format: inspected.format,
      vector: inspected.vector,
      previewPath,
      warnings: inspected.warnings,
      pageSizeMm: inspected.pageSizeMm,
      uploadedBy: actorId,
    },
  });
  if (insertError) return reject("We could not save this upload.");

  const current = designDocumentSchema.safeParse(order.order_items[0]?.design_snapshot);
  if (!current.success) return { ok: false, message: "This order has no artwork to correct." };
  const { doc } = placeArtwork(
    { ...current.data, elements: [] },
    {
      id: assetId!,
      widthPx: inspected.widthPx,
      heightPx: inspected.heightPx,
      ...(inspected.pageSizeMm ? { pageSizeMm: inspected.pageSizeMm } : {}),
    },
  );

  const outcome = await generateProof({
    orderId: order.id,
    source: "admin_upload",
    actorId,
    document: doc,
  });
  if (!outcome.ok) return { ok: false, message: outcome.message };
  await admin.from("audit_logs").insert({
    actor_id: actorId,
    action: "proof.admin_upload",
    entity_type: "order",
    entity_id: order.id,
    diff: {
      version: outcome.version,
      asset: assetId,
      filename: input.filename,
      ...(input.note ? { note: input.note } : {}),
    },
  });
  return {
    ok: true,
    message: `Proof v${outcome.version} created from ${input.filename}. The customer has been asked to approve it.`,
  };
}
