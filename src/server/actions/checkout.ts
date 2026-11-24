"use server";

import { z } from "zod";

import { getSessionUser } from "@/server/auth";
import { resumeCheckout, startCheckout, type CheckoutOutcome } from "@/server/orders";
import { rateLimit } from "@/server/rate-limit";

export type CheckoutResult = CheckoutOutcome | { ok: false; loginRequired: true; message: string };

const id = z.string().uuid();

async function guard() {
  const user = await getSessionUser();
  if (!user)
    return {
      user: null,
      result: { ok: false, loginRequired: true, message: "Please log in to order." } as const,
    };
  if (!(await rateLimit(`checkout:${user.id}`, 10, 600, false))) {
    return {
      user: null,
      result: {
        ok: false,
        message: "Too many checkout attempts. Please wait a few minutes.",
      } as const,
    };
  }
  return { user, result: null };
}

/** Order a saved design: the server re-checks, re-prices and opens Stripe Checkout. */
export async function startCheckoutAction(designId: string): Promise<CheckoutResult> {
  if (!id.safeParse(designId).success)
    return { ok: false, message: "This design could not be found." };
  const { user, result } = await guard();
  if (!user) return result;
  return startCheckout({ id: user.id, email: user.email }, designId);
}

/** Reopen the payment page for an unpaid order. */
export async function resumeCheckoutAction(orderId: string): Promise<CheckoutResult> {
  if (!id.safeParse(orderId).success)
    return { ok: false, message: "This order could not be found." };
  const { user, result } = await guard();
  if (!user) return result;
  return resumeCheckout({ id: user.id, email: user.email }, orderId);
}
