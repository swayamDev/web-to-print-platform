import type Stripe from "stripe";

/**
 * Payment events in our own terms, independent of the provider (DECISIONS D-01: Stripe now,
 * Razorpay possible later). Webhook handlers only ever see these.
 */
export type PaymentEvent =
  | {
      type: "paid";
      eventId: string;
      sessionId: string;
      orderId: string;
      paymentId: string;
      amountMinor: number;
      currency: string;
      customer: { name: string | null; email: string | null; country: string | null };
    }
  | { type: "failed" | "expired"; eventId: string; sessionId: string; orderId: string | null }
  | { type: "ignored"; eventId: string; reason: string };

/** Map a verified Stripe event to a PaymentEvent. Pure, so it can be unit-tested. */
export function fromStripeEvent(event: Stripe.Event): PaymentEvent {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      // Card payments complete as "paid"; slower methods complete as "unpaid" and are
      // confirmed later by async_payment_succeeded.
      if (session.payment_status !== "paid") {
        return {
          type: "ignored",
          eventId: event.id,
          reason: `payment_status ${session.payment_status}`,
        };
      }
      const orderId = session.metadata?.order_id ?? session.client_reference_id;
      if (!orderId) return { type: "ignored", eventId: event.id, reason: "no order id" };
      const paymentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      return {
        type: "paid",
        eventId: event.id,
        sessionId: session.id,
        orderId,
        paymentId: paymentId ?? session.id,
        amountMinor: session.amount_total ?? 0,
        currency: (session.currency ?? "").toUpperCase(),
        customer: {
          name: session.customer_details?.name ?? null,
          email: session.customer_details?.email ?? null,
          country: session.customer_details?.address?.country ?? null,
        },
      };
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = event.data.object;
      return {
        type: event.type === "checkout.session.expired" ? "expired" : "failed",
        eventId: event.id,
        sessionId: session.id,
        orderId: session.metadata?.order_id ?? session.client_reference_id ?? null,
      };
    }
    default:
      return { type: "ignored", eventId: event.id, reason: event.type };
  }
}
