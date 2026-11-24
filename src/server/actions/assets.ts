"use server";

import { z } from "zod";

import type { UploadKind } from "@/domain/uploads";
import {
  getOwnAssets,
  inspectUpload,
  MIME,
  previewPathFor,
  sha256,
  UPLOAD_PATH,
  type ClientAsset,
} from "@/server/assets";
import { getSessionUser } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

const registerSchema = z.object({
  path: z.string().regex(UPLOAD_PATH),
  originalFilename: z.string().trim().min(1).max(200),
  kind: z.enum(["logo", "artwork"]),
});

export type RegisterUploadResult =
  | { status: "valid"; asset: ClientAsset }
  | { status: "rejected"; reason: string }
  | { status: "login-required" };

/**
 * Register a file the customer has just uploaded to their own folder in the `uploads` bucket
 * (the browser uploads directly, so large files never pass through a serverless function).
 * The server then reads the stored bytes, checks them, makes a preview for vector files and
 * records the asset. Rejected files are deleted and the reason is returned.
 */
export async function registerUploadAction(
  input: z.input<typeof registerSchema>,
): Promise<RegisterUploadResult> {
  const user = await getSessionUser();
  if (!user) return { status: "login-required" };
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { status: "rejected", reason: "This upload could not be read." };
  const { path, originalFilename, kind } = parsed.data;
  const [, ownerId, assetId] = UPLOAD_PATH.exec(path)!;
  if (ownerId !== user.id) return { status: "rejected", reason: "This upload could not be read." };

  const { headers } = await import("next/headers");
  if (!(await rateLimit(`upload:${user.id}:${clientIp(await headers())}`, 30, 600, false))) {
    return { status: "rejected", reason: "Too many uploads. Please wait a few minutes." };
  }

  // Secret-key client, only after confirming the path is inside this user's own folder.
  const admin = createSupabaseAdminClient();
  const storage = admin.storage.from("uploads");
  const { data: blob, error } = await storage.download(path);
  if (error || !blob)
    return { status: "rejected", reason: "The upload did not arrive. Please try again." };
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const reject = async (reason: string): Promise<RegisterUploadResult> => {
    await storage.remove([path]);
    return { status: "rejected", reason };
  };

  const result = await inspectUpload(bytes, originalFilename, kind as UploadKind);
  if (!result.ok) return reject(result.reason);

  let previewPath: string | null = null;
  if (result.preview) {
    previewPath = previewPathFor(path);
    const { error: previewError } = await storage.upload(previewPath, result.preview, {
      contentType: "image/png",
      upsert: true,
    });
    if (previewError)
      return reject("We could not prepare a preview of this file. Please try again.");
  }

  const { error: insertError } = await admin.from("assets").insert({
    id: assetId,
    owner_id: user.id,
    bucket: "uploads",
    path,
    kind,
    original_filename: originalFilename,
    mime_type: MIME[result.format],
    bytes: bytes.length,
    sha256: sha256(bytes),
    width_px: result.widthPx,
    height_px: result.heightPx,
    page_count: result.pageCount,
    page_size_mm: result.pageSizeMm,
    status: "valid",
    validation: {
      format: result.format,
      vector: result.vector,
      previewPath,
      warnings: result.warnings,
      pageSizeMm: result.pageSizeMm,
    },
  });
  if (insertError) return reject("We could not save this upload. Please try again.");

  const [asset] = await getOwnAssets([assetId!]);
  return asset
    ? { status: "valid", asset }
    : reject("We could not save this upload. Please try again.");
}
