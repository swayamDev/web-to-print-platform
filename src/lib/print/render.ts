import { layoutDocument } from "@/domain/design/layout";
import type { DesignDocument, PlaceholderValues } from "@/domain/design/schema";
import { mmToPx } from "@/domain/design/units";
import { blockingIssues, validateDocument, type DesignIssue } from "@/domain/design/validate";
import type { AssetInfo } from "@/domain/uploads";

import type { LoadedFont } from "./fonts";
import { renderPdf, type PdfImageSource, type PdfMeta } from "./pdf";
import { renderPng } from "./png";
import { pdfPageToPng, svgToPng } from "./rasterize";
import { layoutToSvg } from "./svg";

/**
 * Render a design to a print file (server-side). Lays out, validates, prepares uploaded images
 * for the chosen output and renders. Blocking issues stop production output; previews may pass
 * `allowIssues` to render anyway (warnings never block).
 */

export type RenderAsset = { info: AssetInfo; bytes: Uint8Array };

export type RenderInput = {
  document: DesignDocument;
  values?: PlaceholderValues;
  format: "pdf" | "png";
  /** PNG resolution and the resolution SVG uploads are rasterised at for PDFs. */
  dpi?: number;
  /** Draw trim, bleed and safe-area guides (PNG proofs/previews only). */
  guides?: boolean;
  /** Diagonal watermark text (PNG proofs only; print files never carry one). */
  watermark?: string;
  meta: PdfMeta;
  fonts: Map<string, LoadedFont>;
  assets?: ReadonlyMap<string, RenderAsset>;
  allowIssues?: boolean;
};

export type RenderResult =
  | { ok: true; bytes: Uint8Array; contentType: string; issues: DesignIssue[] }
  | { ok: false; issues: DesignIssue[] };

const MAX_RASTER_PX = 8000;
const dataUri = (mime: string, bytes: Uint8Array) =>
  `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

export async function renderDocument(input: RenderInput): Promise<RenderResult> {
  const dpi = input.dpi ?? 300;
  const assets = input.assets ?? new Map<string, RenderAsset>();
  const infos = new Map([...assets].map(([id, a]) => [id, a.info]));
  const layout = layoutDocument(
    input.document,
    input.values ?? {},
    (id) => input.fonts.get(id)?.metrics,
  );
  const issues = validateDocument(input.document, layout, infos);
  if (blockingIssues(issues).length > 0 && !input.allowIssues) return { ok: false, issues };

  // The widest placement of each asset decides how many pixels a vector needs at this DPI.
  const widestMm = new Map<string, number>();
  for (const item of layout.items) {
    if (item.kind === "image" && item.assetId && assets.has(item.assetId)) {
      widestMm.set(item.assetId, Math.max(widestMm.get(item.assetId) ?? 0, item.w));
    }
  }
  const pxFor = (id: string) =>
    Math.min(MAX_RASTER_PX, mmToPx(widestMm.get(id) ?? 10, Math.max(dpi, 300)));

  if (input.format === "pdf") {
    const images = new Map<string, PdfImageSource>();
    for (const id of widestMm.keys()) {
      const { info, bytes } = assets.get(id)!;
      // PDFs stay vector; SVGs are rasterised at print resolution; PNG/JPEG embed as uploaded.
      images.set(
        id,
        info.format === "svg"
          ? { format: "png", bytes: svgToPng(bytes, pxFor(id)).png }
          : { format: info.format, bytes },
      );
    }
    return {
      ok: true,
      bytes: await renderPdf(layout, input.fonts, input.meta, images),
      contentType: "application/pdf",
      issues,
    };
  }

  const images = new Map<string, string>();
  for (const id of widestMm.keys()) {
    const { info, bytes } = assets.get(id)!;
    if (info.format === "pdf") {
      const widthPt = info.widthPx; // PDF assets record their trim width in points
      const pdfDpi = Math.min(dpi, (MAX_RASTER_PX / Math.max(widthPt, 1)) * 72);
      images.set(id, dataUri("image/png", (await pdfPageToPng(bytes, { dpi: pdfDpi })).png));
    } else {
      const mime = info.format === "svg" ? "image/svg+xml" : `image/${info.format}`;
      images.set(id, dataUri(mime, bytes));
    }
  }
  const svg = layoutToSvg(layout, input.fonts, {
    images,
    ...(input.guides ? { guides: { safeMarginMm: input.document.safeMargin } } : {}),
    ...(input.watermark && input.fonts.get("inter-semibold")
      ? { watermark: { text: input.watermark, font: input.fonts.get("inter-semibold")! } }
      : {}),
  });
  return {
    ok: true,
    bytes: renderPng(svg, layout.pageWidthMm, dpi),
    contentType: "image/png",
    issues,
  };
}
