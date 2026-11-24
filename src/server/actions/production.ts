"use server";

import { z } from "zod";

import { getSessionUser } from "@/server/auth";
import { generateProductionFiles } from "@/server/production";
import { rateLimit } from "@/server/rate-limit";

export type ProductionActionResult = { ok: true; message: string } | { ok: false; message: string };

/** Admin: render the approved proof's print files and move the order to production. */
export async function generateProductionFilesAction(
  orderId: unknown,
): Promise<ProductionActionResult> {
  const id = z.string().uuid().safeParse(orderId);
  // requireAdmin() would redirect; actions answer with a message instead.
  const user = await getSessionUser();
  if (!user || user.profile.role !== "admin") return { ok: false, message: "Not allowed." };
  if (!id.success) return { ok: false, message: "This order could not be found." };
  if (!(await rateLimit(`production:${user.id}`, 30, 600, false))) {
    return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  }
  const outcome = await generateProductionFiles(id.data, user.id);
  if (!outcome.ok) return { ok: false, message: outcome.message };
  return {
    ok: true,
    message: outcome.startedNow
      ? "Print files generated. The order is now in production."
      : "Print files regenerated.",
  };
}
