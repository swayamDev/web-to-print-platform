"use server";

import { z } from "zod";

import {
  adminProofSchema,
  adminProofUploadUrl,
  changeRole,
  createAdminProof,
  runOrderAction,
  type AdminResult,
} from "@/server/admin";
import { getSessionUser } from "@/server/auth";
import { rateLimit } from "@/server/rate-limit";

/**
 * Admin server actions. Each checks the admin role itself (requireAdmin would redirect;
 * actions answer with a message instead), and the database checks it again.
 */
async function adminActor() {
  const user = await getSessionUser();
  if (!user || user.profile.role !== "admin") return null;
  if (!(await rateLimit(`admin:${user.id}`, 120, 600, false))) return null;
  return user;
}

const NOT_ALLOWED = { ok: false, message: "Not allowed." } as const satisfies AdminResult;

const orderActionSchema = z
  .object({
    orderId: z.string().uuid(),
    action: z.enum(["complete", "cancel", "archive", "unarchive"]),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.action !== "cancel" || (v.note && v.note.length >= 3), {
    message: "Give a reason; it is sent to the customer.",
    path: ["note"],
  });

export async function adminOrderAction(input: unknown): Promise<AdminResult> {
  const user = await adminActor();
  if (!user) return NOT_ALLOWED;
  const parsed = orderActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { orderId, action, note } = parsed.data;
  return runOrderAction(user.id, orderId, action, note || null);
}

const roleSchema = z.object({ userId: z.string().uuid(), role: z.enum(["customer", "admin"]) });

export async function adminSetRoleAction(input: unknown): Promise<AdminResult> {
  const user = await adminActor();
  if (!user) return NOT_ALLOWED;
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  return changeRole(user.id, parsed.data.userId, parsed.data.role);
}

const uploadUrlSchema = z.object({
  orderId: z.string().uuid(),
  filename: z.string().trim().min(1).max(200),
});

export async function adminProofUploadUrlAction(
  input: unknown,
): Promise<{ ok: true; path: string; token: string } | { ok: false; message: string }> {
  const user = await adminActor();
  if (!user) return NOT_ALLOWED;
  const parsed = uploadUrlSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  return adminProofUploadUrl(parsed.data.orderId, parsed.data.filename);
}

export async function adminCreateProofAction(input: unknown): Promise<AdminResult> {
  const user = await adminActor();
  if (!user) return NOT_ALLOWED;
  const parsed = adminProofSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "This upload could not be read." };
  return createAdminProof(user.id, parsed.data);
}
