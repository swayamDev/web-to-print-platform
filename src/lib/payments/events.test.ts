import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { fromStripeEvent } from "./events";

const session = (overrides: Record<string, unknown> = {}) => ({
  id: "cs_test_123",
  object: "checkout.session",
  payment_status: "paid",
  amount_total: 1620,
  currency: "gbp",
  client_reference_id: "order-1",
  metadata: { order_id: "order-1" },
  payment_intent: "pi_test_456",
  customer_details: { name: "Priya Shah", email: "priya@example.com", address: { country: "GB" } },
  ...overrides,
});

const event = (type: string, object: Record<string, unknown>) =>
  ({ id: "evt_test_1", object: "event", type, data: { object } }) as unknown as Stripe.Event;

describe("fromStripeEvent", () => {
  it("maps a paid checkout to a payment for the order", () => {
    expect(fromStripeEvent(event("checkout.session.completed", session()))).toEqual({
      type: "paid",
      eventId: "evt_test_1",
      sessionId: "cs_test_123",
      orderId: "order-1",
      paymentId: "pi_test_456",
      amountMinor: 1620,
      currency: "GBP",
      customer: { name: "Priya Shah", email: "priya@example.com", country: "GB" },
    });
  });

  it("waits for slower payment methods to settle", () => {
    const unpaid = fromStripeEvent(
      event("checkout.session.completed", session({ payment_status: "unpaid" })),
    );
    expect(unpaid.type).toBe("ignored");
    const settled = fromStripeEvent(event("checkout.session.async_payment_succeeded", session()));
    expect(settled.type).toBe("paid");
  });

  it("reports failed and expired checkouts", () => {
    expect(fromStripeEvent(event("checkout.session.async_payment_failed", session())).type).toBe(
      "failed",
    );
    expect(
      fromStripeEvent(event("checkout.session.expired", session({ payment_status: "unpaid" })))
        .type,
    ).toBe("expired");
  });

  it("ignores unrelated events and sessions without an order", () => {
    expect(fromStripeEvent(event("customer.created", {})).type).toBe("ignored");
    expect(
      fromStripeEvent(
        event("checkout.session.completed", session({ metadata: {}, client_reference_id: null })),
      ).type,
    ).toBe("ignored");
  });
});

describe("webhook signatures (Stripe's own verification)", () => {
  const secret = "whsec_unit_test_secret";
  const payload = JSON.stringify(event("checkout.session.completed", session()));

  it("accepts a correctly signed payload", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(Stripe.webhooks.constructEvent(payload, header, secret).id).toBe("evt_test_1");
  });

  it("rejects a tampered payload or the wrong secret", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const tampered = payload.replace("1620", "1");
    expect(() => Stripe.webhooks.constructEvent(tampered, header, secret)).toThrow();
    expect(() => Stripe.webhooks.constructEvent(payload, header, "whsec_other")).toThrow();
  });
});
