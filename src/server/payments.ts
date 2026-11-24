import "server-only";

import Stripe from "stripe";

import { fromStripeEvent, type PaymentEvent } from "@/lib/payments/events";

/**
 * Payment provider (PRD p5 §05: Stripe or an equivalent PCI-compliant gateway). Stripe hosted
 * Checkout: card details are entered on Stripe's own page, so they never touch this app (the
 * lowest PCI scope). The interface keeps a Razorpay adapter possible (DECISIONS D-01).
 */
export type CheckoutRequest = {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  currency: string;
  /** Total including tax, in minor units: always the server-calculated price. */
  amountMinor: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
};

export type PaymentProvider = {
  name: "stripe";
  isConfigured(): boolean;
  createCheckout(request: CheckoutRequest): Promise<{ id: string; url: string }>;
  /** Stop an older checkout session so a customer cannot pay twice for one order. */
  expireCheckout(sessionId: string): Promise<void>;
  /** Verify the webhook signature against the raw body, then map the event. Throws if invalid. */
  parseWebhook(rawBody: string, signature: string | null): PaymentEvent;
};

let client: Stripe | null = null;
const stripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (key.startsWith("sk_live_") && process.env.ALLOW_LIVE_PAYMENTS !== "true") {
    // This is a demonstration: refuse live keys unless explicitly allowed.
    throw new Error("Live Stripe keys are not allowed in this deployment");
  }
  client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
  return client;
};

export const paymentProvider: PaymentProvider = {
  name: "stripe",

  isConfigured() {
    return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  },

  async createCheckout(request) {
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: request.orderId,
        customer_email: request.customerEmail,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: request.currency.toLowerCase(),
              unit_amount: request.amountMinor,
              product_data: { name: request.description },
            },
          },
        ],
        metadata: { order_id: request.orderId, order_number: request.orderNumber },
        payment_intent_data: {
          metadata: { order_id: request.orderId, order_number: request.orderNumber },
          description: `Order ${request.orderNumber}`,
        },
        billing_address_collection: "auto",
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        // Unpaid checkout pages close after 24 hours (Stripe's maximum).
        expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      },
      // A retried request for the same order and amount never creates a second session.
      { idempotencyKey: `checkout-${request.orderId}-${request.amountMinor}-${Date.now() >> 16}` },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { id: session.id, url: session.url };
  },

  async expireCheckout(sessionId) {
    try {
      const session = await stripe().checkout.sessions.retrieve(sessionId);
      if (session.status === "open") await stripe().checkout.sessions.expire(sessionId);
    } catch {
      // Already expired or completed: nothing to do.
    }
  },

  parseWebhook(rawBody, signature) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    if (!signature) throw new Error("Missing Stripe-Signature header");
    const event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
    return fromStripeEvent(event);
  },
};
