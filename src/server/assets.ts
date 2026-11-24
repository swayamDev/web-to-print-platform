import "server-only";

import { createHash } from "node:crypto";

import { PDFDocument } from "pdf-lib";
import { z } from "zod";

import {
  checkFormat,
  detectFormat,
  jpegSize,
  pngSize,
  svgSafetyIssue,
  svgSize,
  type AssetFormat,
  type AssetInfo,
  type UploadKind,
} from "@/domain/uploads";
import { pdfPageToPng, svgToPng } from "@/lib/print/rasterize";
import type { RenderAsset } from "@/lib/print/render";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

const PREVIEW_MAX_PX = 1600;
const PT_TO_MM = 25.4 / 72;

export type InspectionResult =
  | {
      ok: true;
      format: AssetFormat;
      vector: boolean;
      widthPx: number;
      heightPx: number;
      pageCount: number | null;
      /** PDFs: trim size (TrimBox, else MediaBox) and full page size, in mm. */
      pageSizeMm: { w: number; h: number; mediaW: number; mediaH: number } | null;
      /** PNG preview for vector files (PDF, SVG); rasters preview as themselves. */
      preview: Uint8Array | null;
      warnings: string[];
    }
  | { ok: false; reason: string };

/**
 * Inspect an uploaded file on the server: real format from its bytes, dimensions, PDF page
 * size, SVG safety, and a PNG preview for vector files. Never trusts the browser's metadata.
 */
export async function inspectUpload(
  bytes: Uint8Array,
  filename: string,
  kind: UploadKind,
): Promise<InspectionResult> {
  const check = checkFormat(kind, filename, detectFormat(bytes.subarray(0, 4096)), bytes.length);
  if (!check.ok) return check;
  const warnings: string[] = [];

  switch (check.format) {
    case "png":
    case "jpeg": {
      const size = check.format === "png" ? pngSize(bytes) : jpegSize(bytes);
      if (!size || size.width < 1 || size.height < 1)
        return { ok: false, reason: "This image could not be read." };
      if (size.width * size.height > 100_000_000) {
        return { ok: false, reason: "This image is too large (over 100 megapixels)." };
      }
      return {
        ok: true,
        format: check.format,
        vector: false,
        widthPx: size.width,
        heightPx: size.height,
        pageCount: null,
        pageSizeMm: null,
        preview: null,
        warnings,
      };
    }
    case "svg": {
      const text = new TextDecoder().decode(bytes);
      const unsafe = svgSafetyIssue(text);
      if (unsafe) return { ok: false, reason: unsafe };
      const size = svgSize(text);
      if (!size || size.width <= 0 || size.height <= 0) {
        return { ok: false, reason: "This SVG has no size. Add a viewBox and upload it again." };
      }
      let preview: Uint8Array;
      try {
        preview = svgToPng(text, PREVIEW_MAX_PX).png;
      } catch {
        return { ok: false, reason: "This SVG could not be drawn. Please export it again." };
      }
      return {
        ok: true,
        format: "svg",
        vector: true,
        widthPx: size.width,
        heightPx: size.height,
        pageCount: null,
        pageSizeMm: null,
        preview,
        warnings,
      };
    }
    case "pdf": {
      let pdf: PDFDocument;
      try {
        pdf = await PDFDocument.load(bytes, { updateMetadata: false });
      } catch (error) {
        const encrypted = /encrypt/i.test(String(error));
        return {
          ok: false,
          reason: encrypted
            ? "This PDF is password-protected. Remove the protection and upload it again."
            : "This PDF could not be read. Please export it again.",
        };
      }
      const pageCount = pdf.getPageCount();
      if (pageCount === 0) return { ok: false, reason: "This PDF has no pages." };
      if (pageCount > 1)
        warnings.push(`This PDF has ${pageCount} pages; only the first page is used.`);
      const page = pdf.getPage(0);
      const trim = page.getTrimBox();
      const media = page.getMediaBox();
      let preview: Uint8Array;
      try {
        preview = (await pdfPageToPng(bytes, { dpi: 150, maxPixels: PREVIEW_MAX_PX })).png;
      } catch (error) {
        console.error("PDF preview failed", error);
        return { ok: false, reason: "This PDF could not be drawn. Please export it again." };
      }
      return {
        ok: true,
        format: "pdf",
        vector: true,
        // The whole page is what gets embedded, so its proportions come from the MediaBox (pt).
        widthPx: Math.round(media.width),
        heightPx: Math.round(media.height),
        pageCount,
        pageSizeMm: {
          w: round(trim.width * PT_TO_MM),
          h: round(trim.height * PT_TO_MM),
          mediaW: round(media.width * PT_TO_MM),
          mediaH: round(media.height * PT_TO_MM),
        },
        preview,
        warnings,
      };
    }
  }
}

const round = (n: number) => Math.round(n * 10) / 10;
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export const MIME: Record<AssetFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

/** Storage path rule: {owner id}/{asset id}.{ext}; previews sit next to it. */
export const UPLOAD_PATH = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\.(png|jpe?g|svg|pdf|ai)$/;
export const previewPathFor = (path: string) => path.replace(/\.[a-z]+$/, ".preview.png");

export type ClientAsset = AssetInfo & {
  kind: UploadKind;
  /** Short-lived signed URL of the preview (vector files) or the image itself. */
  url: string;
  warnings: string[];
};

const validationSchema = z.object({
  format: z.enum(["png", "jpeg", "svg", "pdf"]),
  vector: z.boolean(),
  previewPath: z.string().nullable(),
  warnings: z.array(z.string()).default([]),
  pageSizeMm: z
    .object({ w: z.number(), h: z.number(), mediaW: z.number(), mediaH: z.number() })
    .nullable()
    .optional(),
});

/**
 * The signed-in customer's valid assets with short-lived preview URLs, for the designer.
 * Row Level Security limits both the rows and the storage objects to the owner.
 */
export async function getOwnAssets(ids: string[]): Promise<ClientAsset[]> {
  const unique = [...new Set(ids)].filter((id) => z.string().uuid().safeParse(id).success);
  if (unique.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("assets")
    .select("id, path, kind, width_px, height_px, validation, status")
    .in("id", unique)
    .eq("status", "valid");
  const rows = (data ?? []).flatMap((row) => {
    const v = validationSchema.safeParse(row.validation);
    return v.success && (row.kind === "logo" || row.kind === "artwork") ? [{ row, v: v.data }] : [];
  });
  if (rows.length === 0) return [];
  const paths = rows.map(({ row, v }) => v.previewPath ?? row.path);
  const { data: signed } = await supabase.storage.from("uploads").createSignedUrls(paths, 60 * 60);
  return rows.flatMap(({ row, v }, i) => {
    const url = signed?.[i]?.signedUrl;
    if (!url) return [];
    return [
      {
        id: row.id,
        kind: row.kind as UploadKind,
        format: v.format,
        vector: v.vector,
        widthPx: row.width_px ?? 1,
        heightPx: row.height_px ?? 1,
        pageSizeMm: v.pageSizeMm ?? undefined,
        url,
        warnings: v.warnings,
      },
    ];
  });
}

/**
 * Original bytes and details of valid uploads, for rendering proofs and print files on the
 * server. Uses the secret key, so callers must already have checked who may render what;
 * `ownerId` restricts the files to one customer's uploads.
 */
export async function loadAssetFiles(
  ids: string[],
  ownerId: string,
): Promise<Map<string, RenderAsset>> {
  const unique = [...new Set(ids)].filter((id) => z.string().uuid().safeParse(id).success);
  const files = new Map<string, RenderAsset>();
  if (unique.length === 0) return files;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("assets")
    .select("id, path, width_px, height_px, validation")
    .in("id", unique)
    .eq("owner_id", ownerId)
    .eq("status", "valid");
  await Promise.all(
    (data ?? []).map(async (row) => {
      const v = validationSchema.safeParse(row.validation);
      if (!v.success) return;
      const { data: blob } = await admin.storage.from("uploads").download(row.path);
      if (!blob) return;
      files.set(row.id, {
        info: {
          id: row.id,
          format: v.data.format,
          vector: v.data.vector,
          widthPx: row.width_px ?? 1,
          heightPx: row.height_px ?? 1,
          pageSizeMm: v.data.pageSizeMm ?? undefined,
        },
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
    }),
  );
  return files;
}
