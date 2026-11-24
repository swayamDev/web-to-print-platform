"use server";

import { z } from "zod";

import { getSessionUser } from "@/server/auth";
import { generateProductionFiles } from "@/server/production";
import { rateLimit } from "@/server/rate-limit";

export type ProductionActionResult =
  | {
      ok: true;
      done: boolean;
      progress: { processed: number; total: number } | null;
      message: string;
    }
  | { ok: false; message: string };

const inputSchema = z.object({ orderId: z.string().uuid(), restart: z.boolean().default(false) });

/**
 * Admin: render the approved proof's print files and move the order to production. For
 * variable-data orders one call renders one batch of rows; the page calls again until done.
 */
export async function generateProductionFilesAction(
  input: unknown,
): Promise<ProductionActionResult> {
  // requireAdmin() would redirect; actions answer with a message instead.
  const user = await getSessionUser();
  if (!user || user.profile.role !== "admin") return { ok: false, message: "Not allowed." };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "This order could not be found." };
  // Generous: a 100-row job takes 10 calls.
  if (!(await rateLimit(`production:${user.id}`, 300, 600, false))) {
    return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  }
  const outcome = await generateProductionFiles(parsed.data.orderId, user.id, {
    restart: parsed.data.restart,
  });
  if (!outcome.ok) return { ok: false, message: outcome.message };
  return {
    ok: true,
    done: outcome.done,
    progress: outcome.progress,
    message: !outcome.done
      ? `Rendering rows… ${outcome.progress?.processed ?? 0} of ${outcome.progress?.total ?? 0}`
      : outcome.startedNow
        ? "Print files generated. The order is now in production."
        : "Print files regenerated.",
  };
}
