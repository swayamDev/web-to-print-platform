import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { Resvg } from "@resvg/resvg-js";

import { setPngDpi } from "./png";

/**
 * Server-side rasterising of vector uploads: PDF pages (pdf.js drawing onto @napi-rs/canvas)
 * and SVGs (resvg). Used for designer previews and for PNG print output, so a customer's PDF or
 * Illustrator artwork never needs a browser to be turned into pixels.
 */

// Fonts referenced but not embedded by a PDF (e.g. plain Helvetica) and CJK character maps.
// Resolved from the project root (bundlers rewrite require.resolve); next.config.ts traces
// these folders into the serverless bundle at the same relative paths.
const pdfjsDir = () => join(process.cwd(), "node_modules", "pdfjs-dist");

export async function pdfPageToPng(
  pdfBytes: Uint8Array,
  options: { dpi?: number; maxPixels?: number; pageIndex?: number } = {},
): Promise<{ png: Uint8Array; width: number; height: number }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: pdfBytes.slice(),
    standardFontDataUrl: pathToFileURL(join(pdfjsDir(), "standard_fonts") + "/").href,
    cMapUrl: pathToFileURL(join(pdfjsDir(), "cmaps") + "/").href,
    cMapPacked: true,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage((options.pageIndex ?? 0) + 1);
    const base = page.getViewport({ scale: 1 }); // points
    let scale = (options.dpi ?? 150) / 72;
    if (options.maxPixels) {
      scale = Math.min(scale, options.maxPixels / Math.max(base.width, base.height));
    }
    const viewport = page.getViewport({ scale });
    const width = Math.max(1, Math.round(viewport.width));
    const height = Math.max(1, Math.round(viewport.height));
    const factory = pdf.canvasFactory as {
      create(
        w: number,
        h: number,
      ): { canvas: { encode(type: "png"): Promise<Buffer> }; context: unknown };
    };
    const { canvas, context } = factory.create(width, height);
    // White paper behind transparent PDF pages.
    const ctx = context as {
      fillStyle: string;
      fillRect(x: number, y: number, w: number, h: number): void;
    };
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    await page.render({ canvasContext: context as never, viewport, canvas: canvas as never })
      .promise;
    let png: Uint8Array = new Uint8Array(await canvas.encode("png"));
    if (options.dpi) png = setPngDpi(png, options.dpi);
    return { png, width, height };
  } finally {
    await task.destroy();
  }
}

export function svgToPng(
  svg: string | Uint8Array,
  widthPx: number,
): { png: Uint8Array; width: number; height: number } {
  const resvg = new Resvg(typeof svg === "string" ? svg : Buffer.from(svg), {
    fitTo: { mode: "width", value: Math.max(1, Math.round(widthPx)) },
    font: { loadSystemFonts: false },
  });
  const image = resvg.render();
  return { png: new Uint8Array(image.asPng()), width: image.width, height: image.height };
}
