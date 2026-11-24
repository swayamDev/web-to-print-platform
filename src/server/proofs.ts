import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { canonicalJson } from "@/domain/canonical";
import {
  designDocumentSchema,
  type DesignDocument,
  type PlaceholderValues,
} from "@/domain/design/schema";
import { combinePdfs, type PdfMeta } from "@/lib/print/pdf";
import type { RenderAsset } from "@/lib/print/render";
import { loadAssetFiles, sha256 } from "@/server/assets";
import { designConfigSchema } from "@/server/designs";
import { proofApprovedEmail, proofReadyEmail } from "@/server/email/templates";
import { serverEnv } from "@/server/env";
import { notifyCustomer } from "@/server/notify";
import type { ResolvedMerge } from "@/server/merge";
import { renderDesign } from "@/server/render";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

/**
 * Proofs (PRD p6 §08). A proof version freezes exactly what the customer approves: the design
 * document, the print configuration and the uploaded files (by content hash), plus for
 * variable-data orders the CSV rows (by dataset hash). From that we render:
 *  - proof.png: 150 DPI, with trim/bleed/safe guides and a PROOF watermark, for checking
 *    (row 1 for variable-data orders);
 *  - proof.pdf: the print file itself (no guides, no watermark), so approved = printed; for
 *    variable-data orders one page per row, so every name and number can be checked.
 * The SHA-256 of the canonical snapshot is stored with the version and in the PDF keywords;
 * production files (Phase 11) are rendered from the approved snapshot and carry the same hash.
 */

export const PROOF_PNG_DPI = 150;
export const PROOF_WATERMARK = "PROOF";

export type ProofSource = "customer_edit" | "admin_upload" | "reorder";

export type GenerateProofOutcome =
  { ok: true; version: number; versionId: string } | { ok: false; code: string; message: string };

const assetIdsOf = (document: DesignDocument) =>
  document.elements.flatMap((e) => (e.type === "image" && e.assetId ? [e.assetId] : []));

/**
 * Hash of exactly what is approved: document + configuration + upload contents, and the CSV
 * data set for variable-data orders (left out otherwise, so earlier hashes stay valid).
 */
export function snapshotHash(
  document: DesignDocument,
  config: unknown,
  assetHashes: { id: string; sha256: string }[],
  datasetHash?: string | null,
): string {
  const assets = [...assetHashes].sort((a, b) => (a.id < b.id ? -1 : 1));
  const canonical = canonicalJson({
    v: 1,
    document,
    config,
    assets,
    ...(datasetHash ? { dataset: datasetHash } : {}),
  });
  return sha256(new TextEncoder().encode(canonical));
}

/** Frozen CSV rows as stored in merge_jobs.rows. */
export const mergeRowsSchema = z.array(z.record(z.string(), z.string()));

export type RowRenderResult =
  { ok: true; files: Uint8Array[] } | { ok: false; row: number; message: string };

/** Render one print PDF (or PNG) per row, in order. Stops at the first row that fails. */
export async function renderRows(input: {
  document: DesignDocument;
  rows: PlaceholderValues[];
  format: "pdf" | "png";
  dpi?: number;
  mirror?: boolean;
  meta: PdfMeta;
  assets: ReadonlyMap<string, RenderAsset>;
}): Promise<RowRenderResult> {
  const files: Uint8Array[] = [];
  for (const [index, values] of input.rows.entries()) {
    const result = await renderDesign({ ...input, values });
    if (!result.ok) {
      return {
        ok: false,
        row: index + 1,
        message: `Row ${index + 1}: ${result.issues[0]?.message ?? "could not be rendered"}`,
      };
    }
    files.push(result.bytes);
  }
  return { ok: true, files };
}

/**
 * Render and record the next proof version for a paid order. `document` replaces the order's
 * artwork (a revision after a change request); otherwise the artwork frozen at checkout is
 * used. Callers must have checked who may do this; it runs with the secret key.
 */
export async function generateProof(input: {
  orderId: string;
  source: ProofSource;
  actorId: string | null;
  document?: DesignDocument;
  /** Revised CSV rows (a revision of a variable-data order); otherwise the frozen merge job. */
  merge?: ResolvedMerge;
  /** Email the customer that a proof is ready (not for reorders, which are approved at once). */
  notify?: boolean;
}): Promise<GenerateProofOutcome> {
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, order_number, customer_id, status, approved_proof_id, order_items(id, config_snapshot, design_snapshot)",
    )
    .eq("id", input.orderId)
    .maybeSingle();
  const item = order?.order_items[0];
  if (!order || !item) return fail("order_not_found");
  if (order.approved_proof_id) return fail("proof_already_approved");
  if (order.status !== "artwork" && order.status !== "proof")
    return fail("order_not_awaiting_proof");

  const document = input.document
    ? designDocumentSchema.safeParse(input.document)
    : designDocumentSchema.safeParse(item.design_snapshot);
  const config = designConfigSchema.safeParse(item.config_snapshot);
  if (!document.success || !config.success) return fail("artwork_invalid");

  const { data: last } = await admin
    .from("proof_versions")
    .select("version")
    .eq("order_id", order.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (last?.version ?? 0) + 1;

  // Variable data: the rows frozen at checkout (or the revised rows of this revision).
  const { data: job } = await admin
    .from("merge_jobs")
    .select("id, rows, dataset_hash")
    .eq("order_id", order.id)
    .maybeSingle();
  const frozenRows = job ? mergeRowsSchema.safeParse(job.rows) : null;
  if (frozenRows && !frozenRows.success) return fail("artwork_invalid");
  const rows = input.merge?.values ?? frozenRows?.data ?? null;
  const dataset = input.merge?.datasetHash ?? job?.dataset_hash ?? null;
  if (rows && (rows.length === 0 || !dataset)) return fail("artwork_invalid");

  const assets = await loadAssetFiles(assetIdsOf(document.data), order.customer_id);
  const hash = snapshotHash(
    document.data,
    config.data,
    [...assets].map(([id, a]) => ({ id, sha256: sha256(a.bytes) })),
    dataset,
  );
  const meta = {
    title: `${order.order_number} proof v${version}`,
    subject: rows ? `Print proof, ${rows.length} rows` : "Print proof",
    keywords: [order.order_number, `proof-v${version}`, `sha256:${hash}`],
    date: new Date(),
  };

  let pdfBytes: Uint8Array;
  if (rows) {
    const pages = await renderRows({ document: document.data, rows, format: "pdf", meta, assets });
    if (!pages.ok) return fail("artwork_invalid", pages.message);
    pdfBytes = await combinePdfs(pages.files, meta);
  } else {
    const pdf = await renderDesign({ document: document.data, format: "pdf", meta, assets });
    if (!pdf.ok) return fail("artwork_invalid", pdf.issues[0]?.message);
    pdfBytes = pdf.bytes;
  }
  const png = await renderDesign({
    document: document.data,
    ...(rows ? { values: rows[0] } : {}),
    format: "png",
    dpi: PROOF_PNG_DPI,
    guides: true,
    watermark: PROOF_WATERMARK,
    meta,
    assets,
  });
  if (!png.ok) return fail("artwork_invalid", png.issues[0]?.message);
  const pdf = { bytes: pdfBytes };

  // A fresh folder per attempt: a retry or a race never overwrites files of a recorded version.
  const folder = `${order.id}/v${version}/${randomUUID()}`;
  const pdfPath = `${folder}/proof.pdf`;
  const pngPath = `${folder}/proof.png`;
  const bucket = admin.storage.from("proofs");
  const uploads = await Promise.all([
    bucket.upload(pdfPath, pdf.bytes, { contentType: "application/pdf" }),
    bucket.upload(pngPath, png.bytes, { contentType: "image/png" }),
  ]);
  if (uploads.some((u) => u.error)) return fail("storage_failed");

  const { data: row, error } = await admin.rpc("create_proof_version", {
    p_order_id: order.id,
    p_version: version,
    p_source: input.source,
    p_document: document.data,
    p_config: config.data,
    p_snapshot_hash: hash,
    p_pdf_path: pdfPath,
    p_png_path: pngPath,
    ...(input.actorId ? { p_actor_id: input.actorId } : {}),
    ...(dataset ? { p_merge_dataset_hash: dataset } : {}),
  });
  if (error || !row) {
    await bucket.remove([pdfPath, pngPath]);
    return fail(errorCode(error?.message));
  }

  if (input.document) {
    // The order's artwork is now the revised design (the approved proof stays the reference).
    await admin.from("order_items").update({ design_snapshot: document.data }).eq("id", item.id);
  }
  if (input.merge && job) {
    // ...and its data is the revised data set.
    await admin
      .from("merge_jobs")
      .update({
        csv_asset_id: input.merge.csvAssetId,
        mapping: input.merge.mapping,
        rows: input.merge.values,
        row_count: input.merge.values.length,
        row_issues: input.merge.check.issues,
        dataset_hash: input.merge.datasetHash,
      })
      .eq("id", job.id);
  }

  if (input.notify === false) return { ok: true, version, versionId: row.id };
  const customer = await customerContact(order.customer_id);
  await notifyCustomer({
    userId: order.customer_id,
    email: customer.email,
    orderId: order.id,
    type: "proof_ready",
    content: proofReadyEmail({
      customerName: customer.name,
      orderNumber: order.order_number,
      version,
      orderUrl: orderUrl(order.id),
    }),
  });
  return { ok: true, version, versionId: row.id };
}

/**
 * Proof v1 straight after payment, if the order has none yet. A reorder's proof is rendered
 * from the same approved snapshot and approved at once with the customer's reorder
 * confirmation (the database refuses unless its hash equals the original approval). Never throws.
 */
export async function ensureFirstProof(orderId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const [{ data: proofs }, { data: order }] = await Promise.all([
      admin.from("proof_versions").select("id, version, status").eq("order_id", orderId),
      admin
        .from("orders")
        .select("reorder_of_order_id, approved_proof_id")
        .eq("id", orderId)
        .single(),
    ]);
    const reorder = Boolean(order?.reorder_of_order_id);
    let pending =
      reorder && !order?.approved_proof_id
        ? proofs?.find((p) => p.status === "pending")
        : undefined;
    if ((proofs?.length ?? 0) === 0) {
      const outcome = await generateProof({
        orderId,
        source: reorder ? "reorder" : "customer_edit",
        actorId: null,
        notify: !reorder,
      });
      if (!outcome.ok) {
        if (outcome.code !== "proof_version_conflict") {
          console.error("proof generation failed", { orderId, code: outcome.code });
        }
        return;
      }
      if (reorder) pending = { id: outcome.versionId, version: outcome.version, status: "pending" };
    }
    if (reorder && pending) {
      const { error } = await admin.rpc("approve_reorder_proof", {
        p_order_id: orderId,
        p_version_id: pending.id,
      });
      if (error) console.error("reorder approval failed", { orderId, error: error.message });
      else await notifyProofApproved(orderId, pending.version);
    }
  } catch (error) {
    console.error("proof generation crashed", { orderId, error });
  }
}

/** True when an order was paid more than `seconds` ago and still has no proof (retry it). */
export function isStalled(paidAt: string, seconds = 30): boolean {
  return Date.now() - Date.parse(paidAt) > seconds * 1000;
}

export async function notifyProofApproved(orderId: string, version: number) {
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, customer_id")
    .eq("id", orderId)
    .single();
  if (!order) return;
  const customer = await customerContact(order.customer_id);
  await notifyCustomer({
    userId: order.customer_id,
    email: customer.email,
    orderId: order.id,
    type: "proof_approved",
    content: proofApprovedEmail({
      customerName: customer.name,
      orderNumber: order.order_number,
      version,
      approvedAt: new Date().toLocaleString("en-GB", { timeZone: "Europe/London" }),
      orderUrl: orderUrl(order.id),
    }),
  });
}

/** Short-lived links to a customer's own proof files (the bucket itself is private). */
export async function signProofFiles(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await createSupabaseAdminClient()
    .storage.from("proofs")
    .createSignedUrls(unique, 60 * 60);
  return new Map(
    (data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])),
  );
}

// -----------------------------------------------------------------------------

const MESSAGES: Record<string, string> = {
  order_not_found: "This order could not be found.",
  order_not_awaiting_proof: "This order is not waiting for a proof.",
  order_not_in_proof: "This order has no proof waiting for a decision.",
  proof_not_found: "This proof could not be found.",
  proof_outdated:
    "This proof is no longer waiting for a decision: it was approved or replaced. The page has been refreshed.",
  proof_already_approved: "A proof has already been approved for this order.",
  proof_version_conflict: "A new proof is already being prepared. Refresh in a moment.",
  comment_required: "Tell us what to change.",
  artwork_invalid: "The artwork failed the print check.",
  storage_failed: "The proof files could not be saved. Please try again.",
  unknown: "Something went wrong. Please try again.",
};

/** Map a database exception message (e.g. "proof_outdated") to one of our codes. */
export function errorCode(message: string | undefined): string {
  const code = Object.keys(MESSAGES).find((c) => message?.includes(c));
  return code ?? "unknown";
}

export function proofErrorMessage(code: string): string {
  return MESSAGES[code] ?? MESSAGES.unknown!;
}

function fail(code: string, detail?: string): GenerateProofOutcome {
  return {
    ok: false,
    code,
    message: detail ? `${proofErrorMessage(code)} ${detail}` : proofErrorMessage(code),
  };
}

const orderUrl = (id: string) => `${serverEnv().APP_URL}/account/orders/${id}`;

async function customerContact(userId: string) {
  const admin = createSupabaseAdminClient();
  const [{ data: profile }, { data: authUser }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", userId).single(),
    admin.auth.admin.getUserById(userId),
  ]);
  return { name: profile?.full_name ?? null, email: authUser.user?.email ?? null };
}
