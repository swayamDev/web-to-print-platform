import "server-only";

import { zipSync } from "fflate";

import { designDocumentSchema, type DesignDocument } from "@/domain/design/schema";
import { rowLabel } from "@/domain/merge";
import { productionFileName, productionPath, type ProductionOutput } from "@/domain/production";
import { combinePdfs, type PdfMeta } from "@/lib/print/pdf";
import { readPngInfo } from "@/lib/print/png";
import { loadAssetFiles, sha256 } from "@/server/assets";
import { orderInProductionEmail } from "@/server/email/templates";
import { serverEnv } from "@/server/env";
import { datasetHash } from "@/server/merge";
import { notifyCustomer } from "@/server/notify";
import { mergeRowsSchema, snapshotHash } from "@/server/proofs";
import { renderDesign } from "@/server/render";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

/**
 * Production files (PRD p6 §07, p7 §10). Rendered only from the **approved proof's** frozen
 * snapshot, after re-checking its hash, so the printer gets exactly what the customer approved:
 *  - print.pdf: trim + bleed page, TrimBox/BleedBox, embedded fonts, the snapshot hash in its
 *    keywords and the paid date as its timestamp (same input, byte-identical file);
 *  - print.png: the same page at the product's output DPI, DPI written into the file.
 * Variable-data orders get one PDF and one PNG per CSV row in `rows/`, rendered in batches so
 * each request stays well inside serverless time limits, then a combined print.pdf (one page
 * per row) and rows.zip with every row file.
 * Products produced mirrored (stamps) are flipped here, never in the customer's proof.
 * Stored privately in `production/{OrderID}/OrderID_ProductType_Date_Output` (DECISIONS D-13);
 * the database refuses files for anything but the approved proof.
 */

/** Rows rendered per request (PDF + PNG each). */
export const ROW_BATCH = 10;

export type ProductionOutcome =
  | {
      ok: true;
      /** False while rows of a variable-data order remain: call again to continue. */
      done: boolean;
      progress: { processed: number; total: number } | null;
      startedNow: boolean;
    }
  | { ok: false; code: string; message: string };

const MESSAGES: Record<string, string> = {
  order_not_found: "This order could not be found.",
  proof_not_approved: "The customer has not approved a proof yet, so print files stay locked.",
  snapshot_mismatch:
    "The approved artwork no longer matches its proof (an uploaded file or the data changed). Ask the customer for a new proof.",
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

type Output = {
  kind: "pdf" | "png" | "row_pdf" | "row_png" | "zip";
  rowIndex?: number;
  path: string;
  bytes: Uint8Array;
  type: string;
};

/**
 * Generate (or regenerate) the print files of an approved order and start production.
 * For variable-data orders each call renders the next batch of rows; the admin page calls
 * again until `done`. `restart` begins a regeneration from row 1.
 */
export async function generateProductionFiles(
  orderId: string,
  actorId: string,
  options: { restart?: boolean } = {},
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
    .select(
      "id, version, status, document_snapshot, config_snapshot, snapshot_hash, merge_dataset_hash",
    )
    .eq("id", order.approved_proof_id)
    .single();
  const document = designDocumentSchema.safeParse(proof?.document_snapshot);
  if (!proof || proof.status !== "approved" || !document.success) return fail("proof_not_approved");

  // Variable data: the frozen rows must be exactly the data set the customer approved.
  const { data: job } = await admin
    .from("merge_jobs")
    .select("id, rows, row_count, processed_count, status")
    .eq("order_id", order.id)
    .maybeSingle();
  const rows = job ? mergeRowsSchema.safeParse(job.rows) : null;
  if (rows && !rows.success) return fail("snapshot_mismatch");
  const dataset = rows?.data ? datasetHash(rows.data) : null;
  if ((proof.merge_dataset_hash ?? null) !== dataset) return fail("snapshot_mismatch");

  // Approved = printed: the files must hash to exactly the snapshot the customer approved.
  const assetIds = document.data.elements.flatMap((e) =>
    e.type === "image" && e.assetId ? [e.assetId] : [],
  );
  const assets = await loadAssetFiles(assetIds, order.customer_id);
  const hash = snapshotHash(
    document.data,
    proof.config_snapshot,
    [...assets].map(([id, a]) => ({ id, sha256: sha256(a.bytes) })),
    dataset,
  );
  if (hash !== proof.snapshot_hash || assets.size !== new Set(assetIds).size) {
    return fail("snapshot_mismatch");
  }

  const meta: PdfMeta = {
    title: `${order.order_number} print file`,
    subject: `Approved proof v${proof.version}`,
    keywords: [order.order_number, `proof-v${proof.version}`, `sha256:${hash}`],
    date: new Date(order.paid_at),
  };
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
  const ctx = {
    document: document.data,
    meta,
    assets,
    mirror: product.mirror_output,
    dpi: product.output_dpi,
  };
  const save = (outputs: Output[]) => saveOutputs(order.id, proof.id, document.data, outputs);

  if (!job || !rows?.data) {
    // A single design: print.pdf + print.png.
    const [pdf, png] = await Promise.all([
      renderDesign({ ...ctx, format: "pdf" }),
      renderDesign({ ...ctx, format: "png" }),
    ]);
    if (!pdf.ok || !png.ok) {
      const issue = (!pdf.ok ? pdf.issues : !png.ok ? png.issues : [])[0];
      return fail("render_failed", issue?.message);
    }
    const outputs: Output[] = [
      { kind: "pdf", path: name("print.pdf"), bytes: pdf.bytes, type: "application/pdf" },
      { kind: "png", path: name("print.png"), bytes: png.bytes, type: "image/png" },
    ];
    if (!(await save(outputs))) return fail("storage_failed");
    return finish(
      order,
      proof.version,
      hash,
      actorId,
      outputs.map((o) => o.path),
      null,
    );
  }

  // Variable data: the next batch of rows.
  const total = rows.data.length;
  let processed = options.restart || job.status === "done" ? 0 : job.processed_count;
  if (options.restart || job.status === "done") {
    await admin
      .from("merge_jobs")
      .update({ processed_count: 0, status: "processing", started_at: new Date().toISOString() })
      .eq("id", job.id);
  }
  const batch = rows.data.slice(processed, processed + ROW_BATCH);
  const outputs: Output[] = [];
  for (const [offset, values] of batch.entries()) {
    const row = processed + offset + 1;
    const [pdf, png] = await Promise.all([
      renderDesign({ ...ctx, values, format: "pdf" }),
      renderDesign({ ...ctx, values, format: "png" }),
    ]);
    if (!pdf.ok || !png.ok) {
      const issue = (!pdf.ok ? pdf.issues : !png.ok ? png.issues : [])[0];
      await admin.from("merge_jobs").update({ status: "failed" }).eq("id", job.id);
      return fail("render_failed", `Row ${row}: ${issue?.message ?? ""}`);
    }
    outputs.push(
      {
        kind: "row_pdf",
        rowIndex: row,
        path: name(`${rowLabel(row)}.pdf`),
        bytes: pdf.bytes,
        type: "application/pdf",
      },
      {
        kind: "row_png",
        rowIndex: row,
        path: name(`${rowLabel(row)}.png`),
        bytes: png.bytes,
        type: "image/png",
      },
    );
  }
  if (!(await save(outputs))) return fail("storage_failed");
  processed += batch.length;
  await admin
    .from("merge_jobs")
    .update({
      processed_count: processed,
      status: processed >= total ? "done" : "processing",
      ...(job.processed_count === 0 && !options.restart
        ? { started_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", job.id);
  if (processed < total) {
    return { ok: true, done: false, progress: { processed, total }, startedNow: false };
  }

  // All rows done: combined print.pdf and rows.zip, from the stored row files.
  const finalized = await finalizeRows(order.id, total, meta, name);
  if (!finalized) return fail("storage_failed");
  if (!(await save(finalized))) return fail("storage_failed");
  await admin
    .from("merge_jobs")
    .update({
      zip_path: finalized.find((o) => o.kind === "zip")!.path,
      finished_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  return finish(
    order,
    proof.version,
    hash,
    actorId,
    finalized.map((o) => o.path),
    {
      processed,
      total,
    },
  );
}

/** Read back every row file, then build the combined PDF and the ZIP. */
async function finalizeRows(
  orderId: string,
  total: number,
  meta: PdfMeta,
  name: (output: ProductionOutput) => string,
): Promise<Output[] | null> {
  const admin = createSupabaseAdminClient();
  const { data: files } = await admin
    .from("production_files")
    .select("kind, row_index, storage_path")
    .eq("order_id", orderId)
    .in("kind", ["row_pdf", "row_png"])
    .lte("row_index", total)
    .order("row_index");
  if (!files || files.length !== total * 2) return null;
  const bucket = admin.storage.from("production");
  const downloaded = await Promise.all(
    files.map(async (f) => {
      const { data } = await bucket.download(f.storage_path);
      return data ? { ...f, bytes: new Uint8Array(await data.arrayBuffer()) } : null;
    }),
  );
  if (downloaded.some((d) => !d)) return null;
  const all = downloaded as NonNullable<(typeof downloaded)[number]>[];

  const combined = await combinePdfs(
    all.filter((f) => f.kind === "row_pdf").map((f) => f.bytes),
    { ...meta, subject: `${meta.subject}, ${total} rows` },
  );
  // Files are already compressed (PDF streams, PNG): store them; fixed dates keep the ZIP stable.
  const zip = zipSync(
    Object.fromEntries(
      all.map((f) => [
        f.storage_path.split("/").pop()!,
        [f.bytes, { level: 0, mtime: meta.date }] as [Uint8Array, { level: 0; mtime: Date }],
      ]),
    ),
  );
  return [
    { kind: "pdf", path: name("print.pdf"), bytes: combined, type: "application/pdf" },
    { kind: "zip", path: name("rows.zip"), bytes: zip, type: "application/zip" },
  ];
}

/** Upload and record files. Same names on regeneration replace the earlier rows. */
async function saveOutputs(
  orderId: string,
  proofId: string,
  document: DesignDocument,
  outputs: Output[],
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const bucket = admin.storage.from("production");
  const uploads = await Promise.all(
    outputs.map((o) => bucket.upload(o.path, o.bytes, { contentType: o.type, upsert: true })),
  );
  if (uploads.some((u) => u.error)) return false;
  const { error } = await admin.from("production_files").upsert(
    outputs.map((o) => {
      const png = o.kind === "png" || o.kind === "row_png" ? readPngInfo(o.bytes) : null;
      return {
        order_id: orderId,
        proof_version_id: proofId,
        kind: o.kind,
        row_index: o.rowIndex ?? null,
        storage_path: o.path,
        bytes: o.bytes.byteLength,
        sha256: sha256(o.bytes),
        trim_mm: { w: document.trim.w, h: document.trim.h },
        bleed_mm: document.bleed,
        width_px: png?.width ?? null,
        height_px: png?.height ?? null,
        dpi: png?.dpi ?? null,
      };
    }),
    { onConflict: "storage_path" },
  );
  return !error;
}

/** Start production (first time), log it and tell the customer. */
async function finish(
  order: { id: string; order_number: string; customer_id: string; status: string },
  proofVersion: number,
  hash: string,
  actorId: string,
  paths: string[],
  progress: { processed: number; total: number } | null,
): Promise<ProductionOutcome> {
  const admin = createSupabaseAdminClient();
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
    diff: { proofVersion, snapshotHash: hash, files: paths, rows: progress?.total ?? null },
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
  return { ok: true, done: true, progress, startedNow };
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
