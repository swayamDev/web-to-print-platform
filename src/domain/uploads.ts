/**
 * Artwork upload rules (PRD p5 §06: "customers may upload finished artwork: PDF, SVG, AI, PNG").
 * Pure checks used by the server on every upload; the browser's file type and extension are
 * never trusted on their own (DECISIONS D-20).
 */

export type UploadKind = "logo" | "artwork";
export type DetectedFormat = "png" | "jpeg" | "pdf" | "svg" | "ai-legacy" | "unknown";
export type AssetFormat = "png" | "jpeg" | "pdf" | "svg";

export const MAX_BYTES: Record<UploadKind, number> = {
  logo: 10 * 1024 * 1024,
  artwork: 50 * 1024 * 1024, // the storage bucket's limit
};

/** Extensions each upload kind accepts, and the real formats each extension may contain. */
export const ACCEPTED: Record<UploadKind, Record<string, AssetFormat[]>> = {
  logo: { png: ["png"], jpg: ["jpeg"], jpeg: ["jpeg"], svg: ["svg"] },
  artwork: {
    pdf: ["pdf"],
    ai: ["pdf"], // Illustrator files saved with PDF compatibility (the default) are PDFs inside
    svg: ["svg"],
    png: ["png"],
    jpg: ["jpeg"],
    jpeg: ["jpeg"],
  },
};

export const acceptAttribute = (kind: UploadKind) =>
  Object.keys(ACCEPTED[kind])
    .map((ext) => `.${ext}`)
    .join(",");

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((b, i) => bytes[i] === b);

/** Identify a file from its first bytes (at least 1 KB recommended). */
export function detectFormat(head: Uint8Array): DetectedFormat {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  const text = new TextDecoder("utf-8", { fatal: false }).decode(head.subarray(0, 4096));
  const trimmed = text.replace(/^﻿/, "").trimStart();
  if (trimmed.startsWith("%PDF-")) return "pdf";
  if (trimmed.startsWith("%!PS-Adobe")) return "ai-legacy";
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(trimmed))
    return "svg";
  return "unknown";
}

export function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match ? match[1]!.toLowerCase() : "";
}

export type FormatCheck = { ok: true; format: AssetFormat } | { ok: false; reason: string };

/** Check that the real format is acceptable for this kind of upload and matches its extension. */
export function checkFormat(
  kind: UploadKind,
  filename: string,
  detected: DetectedFormat,
  bytes: number,
): FormatCheck {
  const ext = extensionOf(filename);
  const accepted = ACCEPTED[kind];
  const list = Object.keys(accepted)
    .map((e) => e.toUpperCase())
    .join(", ");
  if (!(ext in accepted)) return { ok: false, reason: `Upload a ${list} file.` };
  if (bytes > MAX_BYTES[kind]) {
    return { ok: false, reason: `Files can be up to ${MAX_BYTES[kind] / 1024 / 1024} MB.` };
  }
  if (bytes === 0) return { ok: false, reason: "This file is empty." };
  if (detected === "ai-legacy") {
    return {
      ok: false,
      reason:
        "This Illustrator file was saved without PDF compatibility. In Illustrator choose File › Save As, tick “Create PDF Compatible File” (or save as PDF), then upload it again.",
    };
  }
  if (detected === "unknown" || !accepted[ext]!.includes(detected as AssetFormat)) {
    return { ok: false, reason: `This file is not a valid .${ext} file.` };
  }
  return { ok: true, format: detected as AssetFormat };
}

/** Width and height of a PNG from its IHDR chunk. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Width and height of a JPEG from its first start-of-frame marker. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    const length = view.getUint16(offset + 2);
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * SVGs can carry scripts and links to other servers. Rather than trying to clean them, unsafe
 * SVGs are refused with a clear reason (and they are only ever drawn as images, never inlined).
 */
export function svgSafetyIssue(svg: string): string | null {
  if (/<!ENTITY/i.test(svg)) return "SVG files with entity declarations are not accepted.";
  if (/<script[\s>]/i.test(svg)) return "SVG files with scripts are not accepted.";
  if (/<foreignObject[\s>]/i.test(svg)) return "SVG files with embedded HTML are not accepted.";
  if (/\son[a-z]+\s*=/i.test(svg)) return "SVG files with event handlers are not accepted.";
  if (/javascript:/i.test(svg)) return "SVG files with javascript: links are not accepted.";
  if (/(?:xlink:)?href\s*=\s*["']\s*(?:https?:|\/\/|file:)/i.test(svg)) {
    return "SVG files that load images from other websites are not accepted. Embed the images instead.";
  }
  return null;
}

/** Aspect ratio information from an SVG's viewBox (preferred) or width/height. */
export function svgSize(svg: string): { width: number; height: number } | null {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0];
  if (!root) return null;
  const viewBox =
    /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(root);
  if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
  const w = /\bwidth\s*=\s*["']\s*([\d.]+)/i.exec(root);
  const h = /\bheight\s*=\s*["']\s*([\d.]+)/i.exec(root);
  return w && h ? { width: Number(w[1]), height: Number(h[1]) } : null;
}

/** What the designer and renderers need to know about an uploaded file. */
export type AssetInfo = {
  id: string;
  format: AssetFormat;
  /** Vector artwork (PDF, SVG) prints sharp at any size; rasters are checked for resolution. */
  vector: boolean;
  /** Pixel size for rasters; for vectors, the drawing's own units (used for aspect ratio). */
  widthPx: number;
  heightPx: number;
  /**
   * PDFs: the full page that gets embedded (MediaBox) and its trim (TrimBox, or the MediaBox
   * when the file has none), in mm. Used to place artwork with or without bleed.
   */
  pageSizeMm?: { w: number; h: number; mediaW: number; mediaH: number };
};

export const DPI_WARNING = 150;
export const DPI_MINIMUM = 72;

/** Lowest effective resolution of a raster placed at a physical size (DECISIONS D-14). */
export function effectiveDpiOf(
  asset: AssetInfo,
  placedWmm: number,
  placedHmm: number,
): number | null {
  if (asset.vector) return null;
  const x = (asset.widthPx / placedWmm) * 25.4;
  const y = (asset.heightPx / placedHmm) * 25.4;
  return Math.round(Math.min(x, y));
}
