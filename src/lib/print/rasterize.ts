import { join } from "node:path";
import { pathToFileURL } from "node:url";

import * as napiCanvas from "@napi-rs/canvas";
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

/**
 * pdf.js loads @napi-rs/canvas itself through a dynamic require that serverless bundlers cannot
 * trace, so on Vercel the package would be missing. Importing it statically above makes sure it
 * ships; here we give pdf.js the browser classes it expects and our own canvas factory.
 */
function installCanvasGlobals() {
  const g = globalThis as Record<string, unknown>;
  g.DOMMatrix ??= napiCanvas.DOMMatrix;
  g.ImageData ??= napiCanvas.ImageData;
  g.Path2D ??= napiCanvas.Path2D;
}

type CanvasAndContext = { canvas: napiCanvas.Canvas; context: napiCanvas.SKRSContext2D };

/** Same interface as pdf.js's BaseCanvasFactory, backed by the statically imported canvas. */
class NodeCanvasFactory {
  // pdf.js passes constructor options ({ enableHWA }); none apply on the server.
  create(width: number, height: number): CanvasAndContext {
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    const canvas = napiCanvas.createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(target: CanvasAndContext, width: number, height: number) {
    target.canvas.width = width;
    target.canvas.height = height;
  }
  destroy(target: CanvasAndContext) {
    target.canvas.width = 0;
    target.canvas.height = 0;
  }
  getNoAlphaContext(canvas: napiCanvas.Canvas) {
    return canvas.getContext("2d", { alpha: false });
  }
}

export async function pdfPageToPng(
  pdfBytes: Uint8Array,
  options: { dpi?: number; maxPixels?: number; pageIndex?: number } = {},
): Promise<{ png: Uint8Array; width: number; height: number }> {
  installCanvasGlobals();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: pdfBytes.slice(),
    standardFontDataUrl: pathToFileURL(join(pdfjsDir(), "standard_fonts") + "/").href,
    cMapUrl: pathToFileURL(join(pdfjsDir(), "cmaps") + "/").href,
    cMapPacked: true,
    disableFontFace: true,
    useSystemFonts: false,
    CanvasFactory: NodeCanvasFactory,
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
    const { canvas, context } = new NodeCanvasFactory().create(width, height);
    // White paper behind transparent PDF pages.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
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
