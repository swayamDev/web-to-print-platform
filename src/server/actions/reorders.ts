"use server";

import { z } from "zod";

import { getSessionUser } from "@/server/auth";
import type { CheckoutResult } from "@/server/actions/checkout";
import { rateLimit } from "@/server/rate-limit";
import { startReorder } from "@/server/reorders";
import { requestOrigin } from "@/server/request-origin";

const reorderSchema = z.object({
  orderId: z.string().uuid(),
  // The customer must tick "the artwork is unchanged" (DECISIONS D-12).
  confirmUnchanged: z.literal(true),
});

/** Repeat an approved order at today's price and open payment. */
export async function reorderAction(input: unknown): Promise<CheckoutResult> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Confirm the artwork is unchanged to reorder." };
  }
  const user = await getSessionUser();
  if (!user) return { ok: false, loginRequired: true, message: "Please log in to reorder." };
  if (!(await rateLimit(`checkout:${user.id}`, 10, 600, false))) {
    return { ok: false, message: "Too many checkout attempts. Please wait a few minutes." };
  }
  return startReorder(
    { id: user.id, email: user.email },
    parsed.data.orderId,
    await requestOrigin(),
  );
}
