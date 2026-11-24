import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import Stripe from "stripe";

/**
 * Checkout and payment capture (PRD p5 §05, p10 §16). Stripe's hosted page is not driven here;
 * instead the webhook is exercised with events signed exactly as Stripe signs them, using the
 * local STRIPE_WEBHOOK_SECRET. Runs locally (needs the secret key for setup and Mailpit).
 */

const local = !process.env.E2E_BASE_URL;
const customer = {
  email: process.env.TEST_CUSTOMER_EMAIL ?? "",
  password: process.env.TEST_CUSTOMER_PASSWORD ?? "",
};
const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });

/** A quote order for the test customer, as checkout would leave it (£16.20 for 100 stickers). */
async function createQuoteOrder(totalMinor = 1620) {
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
    config_snapshot: { widthMm: 50, heightMm: 50, materialSlug: "gloss-vinyl", quantity: 100 },
    quantity: 100,
    unit_net: 0.15,
    line_net_minor: 1350,
    line_tax_minor: totalMinor - 1350,
    line_gross_minor: totalMinor,
  });
  return order;
}

function signedEvent(
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

const deliver = (request: APIRequestContext, payload: string, signature: string) =>
  request.post("/api/v1/webhooks/stripe", {
    headers: { "content-type": "application/json", "stripe-signature": signature },
    data: payload,
  });

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(customer.email);
  await page.getByLabel("Password").fill(customer.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("checkout and payment", () => {
  test.skip(({ isMobile }) => isMobile, "payment handling does not depend on the viewport");
  test.skip(!local, "signed test webhooks need the local webhook secret");

  test("a verified payment confirms the order once, issues an invoice and emails the customer", async ({
    page,
    request,
  }) => {
    const order = await createQuoteOrder();
    const { payload, signature } = signedEvent(order, 1620);

    const first = await deliver(request, payload, signature);
    expect(first.status()).toBe(200);
    expect(await first.json()).toMatchObject({ outcome: "processed" });

    // Stripe retries: the same event again changes nothing.
    const again = await deliver(request, payload, signature);
    expect(await again.json()).toMatchObject({ outcome: "duplicate" });

    const db = admin();
    const { data: saved } = await db
      .from("orders")
      .select("status, paid_at, invoice_number")
      .eq("id", order.id)
      .single();
    expect(saved).toMatchObject({ status: "artwork" });
    expect(saved!.paid_at).not.toBeNull();
    expect(saved!.invoice_number).toMatch(/^INV-\d{4}-\d{6}$/);
    const { count } = await db
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id);
    expect(count).toBe(1);

    // The customer sees it as paid, with the pipeline timeline.
    await logIn(page);
    await page.goto(`/account/orders/${order.id}`);
    await expect(page.getByTestId("order-status")).toHaveText("Artwork check");
    await expect(page.getByText(saved!.invoice_number!)).toBeVisible();
    await expect(page.getByTestId("order-timeline")).toContainText("Paid");

    // And receives the confirmation email (local Mailpit).
    await expect
      .poll(
        async () => {
          const res = await request.get("http://127.0.0.1:55324/api/v1/search", {
            params: { query: `subject:"Order ${order.order_number} confirmed"` },
          });
          return ((await res.json()) as { messages: unknown[] }).messages.length;
        },
        { timeout: 15_000 },
      )
      .toBe(1);
  });

  test("forged or tampered webhooks are rejected", async ({ request }) => {
    const order = await createQuoteOrder();
    const { payload, signature } = signedEvent(order, 1620);
    expect((await deliver(request, payload, "t=1,v1=forged")).status()).toBe(400);
    expect(
      (
        await deliver(
          request,
          payload.replace('"amount_total":1620', '"amount_total":1'),
          signature,
        )
      ).status(),
    ).toBe(400);
    const { data } = await admin().from("orders").select("status").eq("id", order.id).single();
    expect(data!.status).toBe("quote");
  });

  test("a payment for the wrong amount does not confirm the order", async ({ request }) => {
    const order = await createQuoteOrder();
    const { payload, signature } = signedEvent(order, 1); // 1p instead of £16.20
    const response = await deliver(request, payload, signature);
    expect(await response.json()).toMatchObject({ outcome: "rejected" });
    const { data } = await admin()
      .from("orders")
      .select("status, paid_at")
      .eq("id", order.id)
      .single();
    expect(data).toMatchObject({ status: "quote", paid_at: null });
  });

  test("an unpaid order offers to pay, and Order now uses the server price", async ({ page }) => {
    const order = await createQuoteOrder();
    await logIn(page);
    await page.goto(`/account/orders/${order.id}`);
    await expect(page.getByTestId("order-status")).toHaveText("Awaiting payment");
    await expect(page.getByRole("button", { name: "Pay now" })).toBeVisible();

    // From the designer: with Stripe configured we land on Stripe's page; without it, a clear message.
    await page.goto("/p/custom-stickers");
    await page.getByRole("link", { name: "Design online" }).click();
    await expect(page.getByTestId("print-check")).toContainText("Ready to print");
    await page.getByRole("button", { name: "Order now" }).click();
    if (process.env.STRIPE_SECRET_KEY) {
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    } else {
      await expect(page.getByTestId("order-error")).toContainText(
        "Online payment is not configured",
      );
    }
  });
});
