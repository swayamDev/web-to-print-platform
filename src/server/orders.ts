import "server-only";

import { layoutDocument } from "@/domain/design/layout";
import { designDocumentSchema } from "@/domain/design/schema";
import { blockingIssues, validateDocument } from "@/domain/design/validate";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { calculatePrice, PRICING_ENGINE_VERSION } from "@/domain/pricing";
import { formatMm } from "@/lib/format";
import type { PaymentEvent } from "@/lib/payments/events";
import { getOwnAssets } from "@/server/assets";
import { designConfigSchema } from "@/server/designs";
import { orderConfirmedEmail } from "@/server/email/templates";
import { serverEnv } from "@/server/env";
import { notifyCustomer } from "@/server/notify";
import { paymentProvider } from "@/server/payments";
import { resolveMerge, type ResolvedMerge } from "@/server/merge";
import { loadPricingRules } from "@/server/pricing";
import { loadPrintFonts } from "@/server/render";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export type CheckoutOutcome = { ok: true; url: string } | { ok: false; message: string };

/**
 * Start checkout for one of the customer's saved designs (PRD p5 §05). The server:
 *  1. re-reads the design under RLS (only the owner's own design);
 *  2. re-validates the artwork with the print engine (no blocking issues allowed);
 *  3. re-prices it from the current database rules (the browser's price is never used);
 *  4. records a `quote` order with the full price breakdown and a frozen copy of the artwork
 *     (and, for variable data, of every checked CSV row: one item per row);
 *  5. opens a Stripe Checkout session for exactly that total.
 */
export async function startCheckout(
  user: { id: string; email: string },
  designId: string,
): Promise<CheckoutOutcome> {
  if (!paymentProvider.isConfigured()) {
    return { ok: false, message: "Online payment is not configured yet. Please try again later." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: design } = await supabase
    .from("designs")
    .select(
      "id, name, config, document, data_merge, product:products(id, slug, name, supports_variable_data)",
    )
    .eq("id", designId)
    .maybeSingle();
  const config = designConfigSchema.safeParse(design?.config);
  const document = designDocumentSchema.safeParse(design?.document);
  if (!design?.product || !config.success || !document.success) {
    return { ok: false, message: "This design could not be found. Save it and try again." };
  }
  const product = design.product;

  // Variable data: every CSV row is re-checked here, and the quantity is the row count.
  let merge: ResolvedMerge | null = null;
  let orderConfig = config.data;
  if (config.data.variableData) {
    if (!product.supports_variable_data) {
      return { ok: false, message: "This product cannot be personalised from a file." };
    }
    const resolved = await resolveMerge(design.data_merge, user.id, document.data);
    if (!resolved.ok) return { ok: false, message: resolved.error };
    const firstError = resolved.merge.check.issues.find((i) => i.severity === "error");
    if (firstError) {
      return { ok: false, message: `Fix your data file before ordering: ${firstError.message}` };
    }
    merge = resolved.merge;
    orderConfig = { ...config.data, quantity: merge.values.length };
  }

  const rules = await loadPricingRules(product.slug);
  if (!rules) return { ok: false, message: "This product is no longer available." };
  const priced = calculatePrice(rules, { productSlug: product.slug, ...orderConfig });
  if (!priced.ok) return { ok: false, message: priced.errors[0]!.message };
  const quote = priced.quote;

  const fonts = await loadPrintFonts();
  const assetIds = document.data.elements.flatMap((e) =>
    e.type === "image" && e.assetId ? [e.assetId] : [],
  );
  const assets = new Map((await getOwnAssets(assetIds)).map((a) => [a.id, a]));
  const layout = layoutDocument(document.data, {}, (id) => fonts.get(id)?.metrics);
  const blocking = blockingIssues(validateDocument(document.data, layout, assets));
  if (blocking.length > 0) {
    return { ok: false, message: `Fix the print check before ordering: ${blocking[0]!.message}` };
  }

  const material = rules.materials.find((m) => m.slug === config.data.materialSlug)?.name ?? "";
  const description = `${product.name} × ${quote.quantity.toLocaleString("en-GB")} (${formatMm(config.data.widthMm)} × ${formatMm(config.data.heightMm)} mm, ${material}${merge ? ", personalised from CSV" : ""})`;

  // Orders, items and payments are written with the secret key: customers cannot write them.
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
        request: { productSlug: product.slug, ...orderConfig },
        quote,
      },
      payment_provider: paymentProvider.name,
    })
    .select("id, order_number")
    .single();
  if (error || !order)
    return { ok: false, message: "We could not start your order. Please try again." };

  const { error: itemError } = await admin.from("order_items").insert({
    order_id: order.id,
    product_id: product.id,
    design_id: design.id,
    description,
    config_snapshot: orderConfig,
    design_snapshot: document.data,
    quantity: quote.quantity,
    unit_net: Number(quote.unit.net),
    discount_percent: Number(quote.tier?.percentOff ?? 0),
    line_net_minor: quote.subtotalNetMinor,
    line_tax_minor: quote.taxMinor,
    line_gross_minor: quote.totalGrossMinor,
    is_variable_data: Boolean(merge),
  });
  if (itemError) return { ok: false, message: "We could not start your order. Please try again." };

  if (merge) {
    const { error: mergeError } = await admin.from("merge_jobs").insert({
      order_id: order.id,
      csv_asset_id: merge.csvAssetId,
      mapping: merge.mapping,
      rows: merge.values,
      row_count: merge.values.length,
      row_issues: merge.check.issues,
      dataset_hash: merge.datasetHash,
      status: "validated",
    });
    if (mergeError) {
      return { ok: false, message: "We could not start your order. Please try again." };
    }
  }

  return openCheckoutSession(
    order.id,
    order.order_number,
    user.email,
    quote.currency,
    quote.totalGrossMinor,
    description,
    design.id,
  );
}

async function openCheckoutSession(
  orderId: string,
  orderNumber: string,
  email: string,
  currency: CurrencyCode,
  totalMinor: number,
  description: string,
  designId: string | null,
): Promise<CheckoutOutcome> {
  const appUrl = serverEnv().APP_URL;
  try {
    const session = await paymentProvider.createCheckout({
      orderId,
      orderNumber,
      customerEmail: email,
      currency,
      amountMinor: totalMinor,
      description: `${description} incl. VAT`,
      successUrl: `${appUrl}/account/orders/${orderId}?checkout=success`,
      cancelUrl: designId
        ? `${appUrl}/design/${designId}?checkout=cancelled`
        : `${appUrl}/account/orders/${orderId}`,
    });
    await createSupabaseAdminClient()
      .from("orders")
      .update({ checkout_session_id: session.id })
      .eq("id", orderId);
    return { ok: true, url: session.url };
  } catch (error) {
    console.error("checkout session failed", error);
    return { ok: false, message: "The payment page could not be opened. Please try again." };
  }
}

/** Reopen payment for one of the customer's unpaid (quote) orders. */
export async function resumeCheckout(
  user: { id: string; email: string },
  orderId: string,
): Promise<CheckoutOutcome> {
  if (!paymentProvider.isConfigured()) {
    return { ok: false, message: "Online payment is not configured yet. Please try again later." };
  }
  const supabase = await createSupabaseServerClient(); // RLS: own orders only
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, currency, total_gross_minor, checkout_session_id, order_items(description, design_id)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, message: "This order could not be found." };
  if (order.status !== "quote") return { ok: false, message: "This order has already been paid." };
  // Close any earlier payment page so the order cannot be paid twice.
  if (order.checkout_session_id) await paymentProvider.expireCheckout(order.checkout_session_id);
  const item = order.order_items[0];
  return openCheckoutSession(
    order.id,
    order.order_number,
    user.email,
    order.currency as CurrencyCode,
    order.total_gross_minor,
    item?.description ?? `Order ${order.order_number}`,
    item?.design_id ?? null,
  );
}

export type ProcessOutcome = "processed" | "duplicate" | "ignored" | "rejected";
export type ProcessResult = {
  outcome: ProcessOutcome;
  /** Set when the order is paid: the caller then makes sure proof v1 exists. */
  paidOrderId?: string;
};

/**
 * Apply a verified payment event. Safe to receive more than once (Stripe retries webhooks):
 * the event id is recorded first, the payment row is unique per payment, and each status
 * change only happens from the expected previous status.
 */
export async function processPaymentEvent(
  event: PaymentEvent,
  eventType: string,
): Promise<ProcessResult> {
  const admin = createSupabaseAdminClient();

  await admin
    .from("webhook_events")
    .upsert(
      { provider: paymentProvider.name, event_id: event.eventId, event_type: eventType },
      { ignoreDuplicates: true },
    );
  const { data: seen } = await admin
    .from("webhook_events")
    .select("processed_at")
    .eq("provider", paymentProvider.name)
    .eq("event_id", event.eventId)
    .single();
  if (seen?.processed_at) return { outcome: "duplicate" };

  const markProcessed = () =>
    admin
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", paymentProvider.name)
      .eq("event_id", event.eventId);

  if (event.type !== "paid") {
    await markProcessed();
    return { outcome: "ignored" };
  }

  const { data: order } = await admin
    .from("orders")
    .select(
      "id, order_number, customer_id, status, paid_at, currency, total_gross_minor, invoice_number",
    )
    .eq("id", event.orderId)
    .maybeSingle();
  if (!order) {
    console.error("payment for unknown order", event.orderId);
    await markProcessed();
    return { outcome: "rejected" };
  }

  // Never trust the amount blindly: it must match the server price recorded at checkout.
  const amountMatches =
    event.amountMinor === order.total_gross_minor && event.currency === order.currency;
  await admin.from("payments").upsert(
    {
      order_id: order.id,
      provider: paymentProvider.name,
      provider_payment_id: event.paymentId,
      amount_minor: event.amountMinor,
      currency: event.currency,
      status: amountMatches ? "succeeded" : "failed",
      raw: { sessionId: event.sessionId, eventId: event.eventId, customer: event.customer },
    },
    { onConflict: "provider,provider_payment_id", ignoreDuplicates: true },
  );
  if (!amountMatches) {
    console.error("payment amount mismatch", {
      order: order.id,
      paid: event.amountMinor,
      expected: order.total_gross_minor,
    });
    await markProcessed();
    return { outcome: "rejected" };
  }

  let confirmedNow = false;
  if (!order.paid_at) {
    const { data: invoiceNumber } = await admin.rpc("next_invoice_number");
    await admin
      .from("orders")
      .update({
        paid_at: new Date().toISOString(),
        invoice_number: invoiceNumber,
        billing_details: event.customer,
      })
      .eq("id", order.id)
      .is("paid_at", null);
    order.invoice_number = invoiceNumber;
  }
  if (order.status === "quote") {
    await admin.rpc("transition_order", {
      p_order_id: order.id,
      p_to_status: "order",
      p_note: "Payment received",
    });
    // The artwork was frozen at checkout, so the job moves straight on to artwork.
    await admin.rpc("transition_order", {
      p_order_id: order.id,
      p_to_status: "artwork",
      p_note: "Artwork attached at checkout",
    });
    confirmedNow = true;
  }
  await markProcessed();

  if (confirmedNow) {
    const [{ data: profile }, { data: items }, { data: authUser }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", order.customer_id).single(),
      admin.from("order_items").select("description").eq("order_id", order.id),
      admin.auth.admin.getUserById(order.customer_id),
    ]);
    await notifyCustomer({
      userId: order.customer_id,
      email: authUser.user?.email ?? event.customer.email,
      orderId: order.id,
      type: "order_confirmed",
      content: orderConfirmedEmail({
        customerName: profile?.full_name ?? event.customer.name,
        orderNumber: order.order_number,
        invoiceNumber: order.invoice_number ?? "",
        summary: items?.[0]?.description ?? `Order ${order.order_number}`,
        total: formatMinor(order.total_gross_minor, order.currency as CurrencyCode),
        orderUrl: `${serverEnv().APP_URL}/account/orders/${order.id}`,
      }),
    });
  }
  return { outcome: "processed", paidOrderId: order.id };
}
