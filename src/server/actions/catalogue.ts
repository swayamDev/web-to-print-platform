"use server";

import { updateTag } from "next/cache";

import { getSessionUser } from "@/server/auth";
import {
  saveProduct,
  saveTemplate,
  saveXeroSettings,
  type SaveResult,
} from "@/server/catalogue-admin";
import { rateLimit } from "@/server/rate-limit";

/**
 * Catalogue admin actions. Each checks the admin role itself, and the database checks it
 * again. Saved changes expire the cached catalogue at once (updateTag), so the next quote,
 * page view and checkout use them.
 */
async function adminActor() {
  const user = await getSessionUser();
  if (!user || user.profile.role !== "admin") return null;
  if (!(await rateLimit(`admin:${user.id}`, 120, 600, false))) return null;
  return user;
}

const NOT_ALLOWED: SaveResult = { ok: false, message: "Not allowed." };

export async function saveProductAction(input: unknown): Promise<SaveResult> {
  const user = await adminActor();
  if (!user) return NOT_ALLOWED;
  const result = await saveProduct(user.id, input);
  if (result.ok) updateTag("catalogue");
  return result;
}

export async function saveTemplateAction(input: unknown): Promise<SaveResult> {
  const user = await adminActor();
  if (!user) return NOT_ALLOWED;
  const result = await saveTemplate(user.id, input);
  if (result.ok) updateTag("catalogue");
  return result;
}

export async function saveXeroSettingsAction(input: unknown): Promise<SaveResult> {
  const user = await adminActor();
  if (!user) return NOT_ALLOWED;
  return saveXeroSettings(user.id, input);
}
