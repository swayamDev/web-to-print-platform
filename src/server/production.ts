import "server-only";

import { designDocumentSchema } from "@/domain/design/schema";
import { productionFileName, productionPath, type ProductionOutput } from "@/domain/production";
import { readPngInfo } from "@/lib/print/png";
import { loadAssetFiles, sha256 } from "@/server/assets";
import { orderInProductionEmail } from "@/server/email/templates";
import { serverEnv } from "@/server/env";
import { notifyCustomer } from "@/server/notify";
import { snapshotHash } from "@/server/proofs";
import { renderDesign } from "@/server/render";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

/**
 * Production files (PRD p6 §07, p7 §10). Rendered only from the **approved proof's** frozen
 * snapshot, after re-checking its hash, so the printer gets exactly what the customer approved:
 *  - print.pdf: trim + bleed page, TrimBox/BleedBox, embedded fonts, the snapshot hash in its
 *    keywords and the paid date as its timestamp (same input, byte-identical file);
 *  - print.png: the same page at the product's output DPI, DPI written into the file.
 * Products produced mirrored (stamps) are flipped here, never in the customer's proof.
 * Stored privately in `production/{OrderID}/OrderID_ProductType_Date_Output` (DECISIONS D-13);
 * the database refuses files for anything but the approved proof.
 */

export type ProductionOutcome =
  | { ok: true; files: { kind: "pdf" | "png"; path: string; bytes: number }[]; startedNow: boolean }
  | { ok: false; code: string; message: string };

const MESSAGES: Record<string, string> = {
  order_not_found: "This order could not be found.",
  proof_not_approved: "The customer has not approved a proof yet, so print files stay locked.",
  snapshot_mismatch:
    "The approved artwork no longer matches its proof (an uploaded file changed or is missing). Ask the customer for a new proof.",
  render_failed: "The print files could not be rendered.",
  storage_failed: "The print files could not be saved. Please try again.",
  order_closed: "This order is completed or cancelled.",
  unknown: "Something went wrong. Please try again.",
};

const fail = (code: string, detail?: string): ProductionOutcome => ({
  ok: false,
  code,
  message: detail
    ? `${MESSAGES[code] ?? MESSAGES.unknown} ${detail}`
    : (MESSAGES[code] ?? MESSAGES.unknown!),
});

/** Generate (or regenerate) the print files of an approved order and start production. */
export async function generateProductionFiles(
  orderId: string,
  actorId: string,
): Promise<ProductionOutcome> {
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select(
      `id, order_number, customer_id, status, paid_at, approved_proof_id, files_unlocked_at,
       order_items(product:products(slug, output_dpi, mirror_output, bleed_mm))`,
    )
    .eq("id", orderId)
    .maybeSingle();
  const product = order?.order_items[0]?.product;
  if (!order || !product || !order.paid_at) return fail("order_not_found");
  if (order.status === "completed" || order.status === "cancelled") return fail("order_closed");
  if (!order.approved_proof_id || !order.files_unlocked_at) return fail("proof_not_approved");

  const { data: proof } = await admin
    .from("proof_versions")
    .select("id, version, status, document_snapshot, config_snapshot, snapshot_hash")
    .eq("id", order.approved_proof_id)
    .single();
  const document = designDocumentSchema.safeParse(proof?.document_snapshot);
  if (!proof || proof.status !== "approved" || !document.success) return fail("proof_not_approved");

  // Approved = printed: the files must hash to exactly the snapshot the customer approved.
  const assetIds = document.data.elements.flatMap((e) =>
    e.type === "image" && e.assetId ? [e.assetId] : [],
  );
  const assets = await loadAssetFiles(assetIds, order.customer_id);
  const hash = snapshotHash(
    document.data,
    proof.config_snapshot,
    [...assets].map(([id, a]) => ({ id, sha256: sha256(a.bytes) })),
  );
  if (hash !== proof.snapshot_hash || assets.size !== new Set(assetIds).size) {
    return fail("snapshot_mismatch");
  }

  const meta = {
    title: `${order.order_number} print file`,
    subject: `Approved proof v${proof.version}`,
    keywords: [order.order_number, `proof-v${proof.version}`, `sha256:${hash}`],
    date: new Date(order.paid_at),
  };
  const common = { document: document.data, meta, assets, mirror: product.mirror_output };
  const [pdf, png] = await Promise.all([
    renderDesign({ ...common, format: "pdf" }),
    renderDesign({ ...common, format: "png", dpi: product.output_dpi }),
  ]);
  if (!pdf.ok || !png.ok) {
    const issue = (!pdf.ok ? pdf.issues : !png.ok ? png.issues : [])[0];
    return fail("render_failed", issue?.message);
  }

  const name = (output: ProductionOutput) =>
    productionPath(
      order.order_number,
      productionFileName({
        orderNumber: order.order_number,
        productSlug: product.slug,
        paidAt: order.paid_at!,
        output,
      }),
    );
  const pngInfo = readPngInfo(png.bytes);
  const trim = { w: document.data.trim.w, h: document.data.trim.h };
  const outputs = [
    { kind: "pdf" as const, path: name("print.pdf"), bytes: pdf.bytes, type: "application/pdf" },
    { kind: "png" as const, path: name("print.png"), bytes: png.bytes, type: "image/png" },
  ];

  const bucket = admin.storage.from("production");
  const uploads = await Promise.all(
    outputs.map((o) => bucket.upload(o.path, o.bytes, { contentType: o.type, upsert: true })),
  );
  if (uploads.some((u) => u.error)) return fail("storage_failed");

  // Same names on regeneration: replace the rows for these paths.
  const { error } = await admin.from("production_files").upsert(
    outputs.map((o) => ({
      order_id: order.id,
      proof_version_id: proof.id,
      kind: o.kind,
      storage_path: o.path,
      bytes: o.bytes.byteLength,
      sha256: sha256(o.bytes),
      trim_mm: trim,
      bleed_mm: document.data.bleed,
      ...(o.kind === "png"
        ? { width_px: pngInfo.width, height_px: pngInfo.height, dpi: pngInfo.dpi }
        : { dpi: null }),
    })),
    { onConflict: "storage_path" },
  );
  if (error) return fail("storage_failed");

  const startedNow = order.status === "proof";
  const { error: startError } = await admin.rpc("start_production", {
    p_order_id: order.id,
    p_actor_id: actorId,
  });
  if (startError) return fail("unknown", startError.message);

  await admin.from("audit_logs").insert({
    actor_id: actorId,
    action: startedNow ? "production.started" : "production.regenerated",
    entity_type: "order",
    entity_id: order.id,
    diff: { proofVersion: proof.version, snapshotHash: hash, files: outputs.map((o) => o.path) },
  });

  if (startedNow) {
    const [{ data: profile }, { data: authUser }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", order.customer_id).single(),
      admin.auth.admin.getUserById(order.customer_id),
    ]);
    await notifyCustomer({
      userId: order.customer_id,
      email: authUser.user?.email ?? null,
      orderId: order.id,
      type: "order_in_production",
      content: orderInProductionEmail({
        customerName: profile?.full_name ?? null,
        orderNumber: order.order_number,
        orderUrl: `${serverEnv().APP_URL}/account/orders/${order.id}`,
      }),
    });
  }

  return {
    ok: true,
    startedNow,
    files: outputs.map((o) => ({ kind: o.kind, path: o.path, bytes: o.bytes.byteLength })),
  };
}

/**
 * A short-lived download link for one production file. Callers must have checked that the
 * user is an admin (requireAdmin); the bucket itself has no customer access at all.
 */
export async function productionDownloadUrl(fileId: string, actorId: string) {
  const admin = createSupabaseAdminClient();
  const { data: file } = await admin
    .from("production_files")
    .select("id, order_id, storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return null;
  const { data } = await admin.storage.from("production").createSignedUrl(file.storage_path, 60, {
    download: file.storage_path.split("/").pop(),
  });
  if (!data?.signedUrl) return null;
  await admin.from("audit_logs").insert({
    actor_id: actorId,
    action: "production.downloaded",
    entity_type: "production_file",
    entity_id: file.id,
    diff: { orderId: file.order_id, path: file.storage_path },
  });
  return data.signedUrl;
}
