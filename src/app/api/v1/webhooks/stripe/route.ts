import { NextResponse, type NextRequest } from "next/server";

import { processPaymentEvent } from "@/server/orders";
import { paymentProvider } from "@/server/payments";

/**
 * POST /api/v1/webhooks/stripe: payment notifications from Stripe.
 *
 * The signature is checked against the raw body with STRIPE_WEBHOOK_SECRET before anything is
 * read; the success page in the browser is never trusted to mark an order paid. Processing is
 * idempotent, so Stripe's retries are harmless. Returns 400 for bad signatures (Stripe will not
 * retry those) and 500 for unexpected failures (Stripe retries).
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  let event;
  try {
    event = paymentProvider.parseWebhook(raw, request.headers.get("stripe-signature"));
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const type = (JSON.parse(raw) as { type?: string }).type ?? "unknown";
    const outcome = await processPaymentEvent(event, type);
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    console.error("webhook processing failed", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
