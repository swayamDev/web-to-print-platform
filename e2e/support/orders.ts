import { createClient } from "@supabase/supabase-js";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import Stripe from "stripe";

/** Shared setup for order, payment and proof specs (local runs: needs the secret key). */

export const local = !process.env.E2E_BASE_URL;
export const customer = {
  email: process.env.TEST_CUSTOMER_EMAIL ?? "",
  password: process.env.TEST_CUSTOMER_PASSWORD ?? "",
};
export const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });

export const STICKER_CONFIG = {
  widthMm: 50,
  heightMm: 50,
  materialSlug: "gloss-vinyl",
  quantity: 100,
  options: {},
  variableData: false,
};

/** A quote order for the test customer, as checkout would leave it (£16.20 for 100 stickers). */
export async function createQuoteOrder(
  totalMinor = 1620,
  design?: { id: string; document: unknown },
) {
  const db = admin();
  const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
  const user = users.users.find((u) => u.email === customer.email)!;
  const { data: product } = await db
    .from("products")
    .select("id")
    .eq("slug", "custom-stickers")
    .single();
  const { data: order, error } = await db
    .from("orders")
    .insert({
      customer_id: user.id,
      currency: "GBP",
      subtotal_net_minor: 1350,
      discount_minor: 150,
      tax_rate: 0.2,
      tax_minor: totalMinor - 1350,
      total_gross_minor: totalMinor,
      pricing_snapshot: {
        engine: "pricing@1",
        quote: { tier: { minQty: 100, percentOff: "10" }, setupFeeMinor: 0 },
      },
      payment_provider: "stripe",
      checkout_session_id: `cs_test_${Date.now()}`,
    })
    .select("id, order_number, checkout_session_id")
    .single();
  if (error) throw error;
  await db.from("order_items").insert({
    order_id: order.id,
    product_id: product!.id,
    description: "Custom Stickers × 100 (50 × 50 mm, Gloss vinyl)",
    config_snapshot: STICKER_CONFIG,
    quantity: 100,
    unit_net: 0.15,
    line_net_minor: 1350,
    line_tax_minor: totalMinor - 1350,
    line_gross_minor: totalMinor,
    design_id: design?.id ?? null,
    design_snapshot: design?.document ?? null,
  });
  return order;
}

export function signedEvent(
  order: { id: string; checkout_session_id: string | null },
  amount: number,
  eventId = `evt_test_${Date.now()}`,
) {
  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: order.checkout_session_id,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: amount,
        currency: "gbp",
        client_reference_id: order.id,
        metadata: { order_id: order.id },
        payment_intent: `pi_test_${eventId}`,
        customer_details: {
          name: "Test Customer",
          email: customer.email,
          address: { country: "GB" },
        },
      },
    },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return { payload, signature };
}

export const deliver = (request: APIRequestContext, payload: string, signature: string) =>
  request.post("/api/v1/webhooks/stripe", {
    headers: { "content-type": "application/json", "stripe-signature": signature },
    data: payload,
  });

export const adminUser = {
  email: process.env.TEST_ADMIN_EMAIL ?? "",
  password: process.env.TEST_ADMIN_PASSWORD ?? "",
};

export async function logIn(page: Page, who: { email: string; password: string } = customer) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Log in" }).click();
  // Customers land on their account, admins on the admin console.
  await expect(page).toHaveURL(/\/(account|admin)$/);
}

/** A simple one-line sticker design, saved for the test customer. */
export async function createStickerDesign(text = "PROOF TEST") {
  const db = admin();
  const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
  const user = users.users.find((u) => u.email === customer.email)!;
  const { data: product } = await db
    .from("products")
    .select("id")
    .eq("slug", "custom-stickers")
    .single();
  const document = stickerDocument(text);
  const { data, error } = await db
    .from("designs")
    .insert({
      owner_id: user.id,
      product_id: product!.id,
      name: `e2e proof ${Date.now()}`,
      config: STICKER_CONFIG,
      document,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, document };
}

export function stickerDocument(text: string) {
  return {
    version: 1,
    unit: "mm",
    trim: { w: 50, h: 50 },
    bleed: 2,
    safeMargin: 3,
    background: { color: "#FFFFFF" },
    printAreas: [{ id: "main", x: 0, y: 0, w: 50, h: 50, shape: "rect", allowBleed: true }],
    elements: [
      {
        id: "name",
        type: "text",
        areaId: "main",
        x: 4,
        y: 20,
        w: 42,
        h: 10,
        rotation: 0,
        text,
        fontId: "sora-bold",
        fontSize: 14,
        minFontSize: 6,
        maxFontSize: 14,
        tracking: 0,
        minTracking: 0,
        fit: "shrink",
        align: "center",
        color: "#121212",
      },
    ],
  };
}

/** Pay for an order with a signed test webhook. */
export async function payOrder(
  request: APIRequestContext,
  order: { id: string; checkout_session_id: string | null; total?: number },
) {
  const { payload, signature } = signedEvent(order, order.total ?? 1620);
  const response = await deliver(request, payload, signature);
  expect(response.status()).toBe(200);
}

export async function mailCount(request: APIRequestContext, subject: string) {
  const res = await request.get("http://127.0.0.1:55324/api/v1/search", {
    params: { query: `subject:"${subject}"` },
  });
  return ((await res.json()) as { messages: unknown[] }).messages.length;
}

/** The test customer's user id. */
export async function customerId() {
  const { data } = await admin().auth.admin.listUsers({ perPage: 200 });
  return data.users.find((u) => u.email === customer.email)!.id;
}

/** A paid order whose proof v1 the customer has approved (as the approve button would). */
export async function approvedOrder(request: APIRequestContext) {
  const design = await createStickerDesign("PRINT ME");
  const order = await createQuoteOrder(1620, design);
  await payOrder(request, order);
  const db = admin();
  let proof: { id: string; snapshot_hash: string } | null = null;
  await expect
    .poll(
      async () => {
        const { data } = await db
          .from("proof_versions")
          .select("id, snapshot_hash")
          .eq("order_id", order.id)
          .maybeSingle();
        proof = data;
        return Boolean(data);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  const { error } = await db.rpc("approve_proof", {
    p_order_id: order.id,
    p_version_id: proof!.id,
    p_version: 1,
    p_actor_id: await customerId(),
  });
  if (error) throw error;
  return { order, proof: proof! };
}
