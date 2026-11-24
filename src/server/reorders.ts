import "server-only";

import { z } from "zod";

import { designDocumentSchema, type DesignDocument } from "@/domain/design/schema";
import { type CurrencyCode } from "@/domain/money";
import { calculatePrice, PRICING_ENGINE_VERSION, type PriceQuote } from "@/domain/pricing";
import { loadAssetFiles, sha256 } from "@/server/assets";
import { designConfigSchema, type DesignConfig } from "@/server/designs";
import { openCheckoutSession, type CheckoutOutcome } from "@/server/orders";
import { paymentProvider } from "@/server/payments";
import { loadPricingRules } from "@/server/pricing";
import { mergeRowsSchema, snapshotHash } from "@/server/proofs";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * One-click reorder (PRD p7 §09, DECISIONS D-12): the same approved artwork, size, material,
 * quantity and data rows, charged at today's prices. The customer confirms the artwork is
 * unchanged; after payment the proof is approved on their behalf (approve_reorder_proof).
 */

export type ReorderSource = {
  orderId: string;
  orderNumber: string;
  customerId: string;
  productId: string;
  productSlug: string;
  description: string;
  designId: string | null;
  document: DesignDocument;
  config: DesignConfig;
  proofHash: string;
  proofVersion: number;
  previousTotalMinor: number;
  merge: {
    csvAssetId: string;
    mapping: unknown;
    rows: Record<string, string>[];
    rowIssues: unknown;
    datasetHash: string;
  } | null;
};

export type ReorderQuote =
  | {
      ok: true;
      source: ReorderSource;
      quote: PriceQuote;
    }
  | { ok: false; message: string };

const REASONS = {
  notFound: "This order could not be found.",
  notApproved: "Only orders with an approved proof can be reordered.",
  cancelled: "Cancelled orders cannot be reordered.",
  unavailable: "This product is no longer available, so this order cannot be repeated.",
  changed:
    "Some of the artwork behind this order has changed or been deleted (for example an uploaded image), so it cannot be repeated exactly. Open the design and order it again instead.",
} as const;

/** Load an order the signed-in customer owns and may reorder, with today's price for it. */
export async function quoteReorder(orderId: string): Promise<ReorderQuote> {
  if (!z.string().uuid().safeParse(orderId).success)
    return { ok: false, message: REASONS.notFound };

  // RLS: the customer can only see their own orders, so this is the ownership check.
  const supabase = await createSupabaseServerClient();
  const { data: own } = await supabase
    .from("orders")
    .select("id, customer_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!own) return { ok: false, message: REASONS.notFound };

  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select(
      `id, order_number, customer_id, status, total_gross_minor, approved_proof_id, cancelled_at,
       order_items(product_id, design_id, description, products(slug)),
       merge_jobs(csv_asset_id, mapping, rows, row_issues, dataset_hash)`,
    )
    .eq("id", own.id)
    .eq("customer_id", own.customer_id)
    .maybeSingle();
  const item = order?.order_items[0];
  if (!order || !item?.products) return { ok: false, message: REASONS.notFound };
  if (order.status === "cancelled" || order.cancelled_at)
    return { ok: false, message: REASONS.cancelled };
  if (!order.approved_proof_id) return { ok: false, message: REASONS.notApproved };

  const { data: proof } = await admin
    .from("proof_versions")
    .select("version, document_snapshot, config_snapshot, snapshot_hash, merge_dataset_hash")
    .eq("id", order.approved_proof_id)
    .single();
  const document = designDocumentSchema.safeParse(proof?.document_snapshot);
  const config = designConfigSchema.safeParse(proof?.config_snapshot);
  if (!proof || !document.success || !config.success) {
    return { ok: false, message: REASONS.changed };
  }

  // Variable data: the rows frozen on the original order (checked against the approved hash).
  const job = ([] as typeof order.merge_jobs).concat(order.merge_jobs ?? [])[0];
  let merge: ReorderSource["merge"] = null;
  if (proof.merge_dataset_hash) {
    const rows = mergeRowsSchema.safeParse(job?.rows);
    if (!job || !rows.success || job.dataset_hash !== proof.merge_dataset_hash) {
      return { ok: false, message: REASONS.changed };
    }
    merge = {
      csvAssetId: job.csv_asset_id,
      mapping: job.mapping,
      rows: rows.data,
      rowIssues: job.row_issues,
      datasetHash: job.dataset_hash,
    };
  }

  const rules = await loadPricingRules(item.products.slug);
  if (!rules) return { ok: false, message: REASONS.unavailable };
  const priced = calculatePrice(rules, { productSlug: item.products.slug, ...config.data });
  if (!priced.ok) return { ok: false, message: REASONS.unavailable };

  return {
    ok: true,
    quote: priced.quote,
    source: {
      orderId: order.id,
      orderNumber: order.order_number,
      customerId: order.customer_id,
      productId: item.product_id,
      productSlug: item.products.slug,
      description: item.description,
      designId: item.design_id,
      document: document.data,
      config: config.data,
      proofHash: proof.snapshot_hash,
      proofVersion: proof.version,
      previousTotalMinor: order.total_gross_minor,
      merge,
    },
  };
}

/** Recompute the approved snapshot hash from today's files: proves nothing has changed. */
async function artworkUnchanged(source: ReorderSource): Promise<boolean> {
  const assetIds = source.document.elements.flatMap((e) =>
    e.type === "image" && e.assetId ? [e.assetId] : [],
  );
  const assets = await loadAssetFiles(assetIds, source.customerId);
  if (assets.size !== new Set(assetIds).size) return false;
  const hash = snapshotHash(
    source.document,
    source.config,
    [...assets].map(([id, a]) => ({ id, sha256: sha256(a.bytes) })),
    source.merge?.datasetHash ?? null,
  );
  return hash === source.proofHash;
}

export type RequestOrigin = { ip: string | null; userAgent: string | null };

/**
 * Create the reorder (a `quote` order at today's price, linked to the original) and open
 * payment. The customer's "artwork unchanged" confirmation is stored with the order and turned
 * into the approval record once it is paid.
 */
export async function startReorder(
  user: { id: string; email: string },
  orderId: string,
  origin: RequestOrigin,
): Promise<CheckoutOutcome> {
  if (!paymentProvider.isConfigured()) {
    return { ok: false, message: "Online payment is not configured yet. Please try again later." };
  }
  const result = await quoteReorder(orderId);
  if (!result.ok) return result;
  const { source, quote } = result;
  if (source.customerId !== user.id) return { ok: false, message: REASONS.notFound };
  if (!(await artworkUnchanged(source))) return { ok: false, message: REASONS.changed };

  const description = `${source.description.replace(/ \(reorder of [^)]*\)$/, "")} (reorder of ${source.orderNumber})`;
  const admin = createSupabaseAdminClient();
  const { data: order, error } = await admin
    .from("orders")
    .insert({
      customer_id: user.id,
      currency: quote.currency,
      subtotal_net_minor: quote.subtotalNetMinor,
      discount_minor: quote.discountMinor,
      tax_rate: Number(quote.taxRate),
      tax_minor: quote.taxMinor,
      total_gross_minor: quote.totalGrossMinor,
      pricing_snapshot: {
        engine: PRICING_ENGINE_VERSION,
        pricedAt: new Date().toISOString(),
        request: { productSlug: source.productSlug, ...source.config },
        quote,
        reorderOf: source.orderNumber,
      },
      payment_provider: paymentProvider.name,
      reorder_of_order_id: source.orderId,
      reorder_confirmation: {
        confirmedAt: new Date().toISOString(),
        ip: origin.ip,
        userAgent: origin.userAgent,
        sourceProofHash: source.proofHash,
      },
    })
    .select("id, order_number")
    .single();
  if (error || !order)
    return { ok: false, message: "We could not start your reorder. Please try again." };

  const { error: itemError } = await admin.from("order_items").insert({
    order_id: order.id,
    product_id: source.productId,
    design_id: source.designId,
    description,
    config_snapshot: source.config,
    design_snapshot: source.document,
    quantity: quote.quantity,
    unit_net: Number(quote.unit.net),
    discount_percent: Number(quote.tier?.percentOff ?? 0),
    line_net_minor: quote.subtotalNetMinor,
    line_tax_minor: quote.taxMinor,
    line_gross_minor: quote.totalGrossMinor,
    is_variable_data: Boolean(source.merge),
  });
  if (itemError)
    return { ok: false, message: "We could not start your reorder. Please try again." };

  if (source.merge) {
    const { error: mergeError } = await admin.from("merge_jobs").insert({
      order_id: order.id,
      csv_asset_id: source.merge.csvAssetId,
      mapping: source.merge.mapping as never,
      rows: source.merge.rows,
      row_count: source.merge.rows.length,
      row_issues: source.merge.rowIssues as never,
      dataset_hash: source.merge.datasetHash,
      status: "validated",
    });
    if (mergeError)
      return { ok: false, message: "We could not start your reorder. Please try again." };
  }

  return openCheckoutSession(
    order.id,
    order.order_number,
    user.email,
    quote.currency as CurrencyCode,
    quote.totalGrossMinor,
    description,
    null,
  );
}
