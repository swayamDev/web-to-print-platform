import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { blankDocument } from "@/domain/design/document";
import { layoutDocument } from "@/domain/design/layout";
import type { DesignDocument, ImageElement } from "@/domain/design/schema";
import { mmToPx } from "@/domain/design/units";

import { FONT_IDS, loadFont, type LoadedFont } from "./fonts";
import { renderPdf } from "./pdf";
import { pdfPageToPng, svgToPng } from "./rasterize";
import { renderDocument, type RenderAsset } from "./render";

/**
 * Uploaded artwork through the print engine: PNG logos, SVG logos and customer PDFs placed in a
 * design must land in the right place in both outputs, with PDFs kept as vectors, and rasters
 * checked for resolution.
 */

const fonts = new Map<string, LoadedFont>();
const ids = {
  png: "11111111-1111-4111-8111-111111111111",
  svg: "22222222-2222-4222-8222-222222222222",
  pdf: "33333333-3333-4333-8333-333333333333",
};
const assets = new Map<string, RenderAsset>();

const solidSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${color}"/></svg>`;

function image(
  id: string,
  assetId: string,
  x: number,
  y: number,
  w: number,
  h: number,
): ImageElement {
  return { id, type: "image", areaId: "main", x, y, w, h, rotation: 0, assetId };
}

function page(elements: ImageElement[]): DesignDocument {
  return { ...blankDocument({ trimW: 100, trimH: 60, bleed: 3, safeMargin: 3 }), elements };
}

beforeAll(async () => {
  for (const id of FONT_IDS) {
    fonts.set(
      id,
      loadFont(id, new Uint8Array(readFileSync(join(process.cwd(), "public/fonts", `${id}.ttf`)))),
    );
  }
  // A 600 × 600 px red PNG, a blue SVG, and a one-page green PDF made by our own renderer.
  assets.set(ids.png, {
    info: { id: ids.png, format: "png", vector: false, widthPx: 600, heightPx: 600 },
    bytes: svgToPng(solidSvg("#ff0000"), 600).png,
  });
  assets.set(ids.svg, {
    info: { id: ids.svg, format: "svg", vector: true, widthPx: 100, heightPx: 100 },
    bytes: new TextEncoder().encode(solidSvg("#0000ff")),
  });
  const greenDoc: DesignDocument = {
    ...blankDocument({ trimW: 40, trimH: 40, bleed: 0, safeMargin: 0 }),
    background: { color: "#00FF00" },
  };
  const greenPdf = await renderPdf(
    layoutDocument(greenDoc, {}, () => undefined),
    fonts,
    {
      title: "green",
      date: new Date(0),
    },
  );
  assets.set(ids.pdf, {
    info: { id: ids.pdf, format: "pdf", vector: true, widthPx: 113, heightPx: 113 },
    bytes: greenPdf,
  });
});

// Three 20 mm squares side by side: PNG at x 10, SVG at x 40, PDF at x 70 (trim mm).
const design = () =>
  page([
    image("logo-png", ids.png, 10, 20, 20, 20),
    image("logo-svg", ids.svg, 40, 20, 20, 20),
    image("art-pdf", ids.pdf, 70, 20, 20, 20),
  ]);

describe("uploaded images in print files", () => {
  it("PNG output shows each upload in its place", async () => {
    const dpi = 100;
    const result = await renderDocument({
      document: design(),
      format: "png",
      dpi,
      meta: { title: "t", date: new Date(0) },
      fonts,
      assets,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect((await decodePng(result.bytes)).width).toBe(mmToPx(106, dpi));
    // Sample the centre of each square (bleed offset 3 mm).
    const at = async (xMm: number, yMm: number) => {
      const decoded = await decodePng(result.bytes);
      const x = mmToPx(xMm, dpi);
      const y = mmToPx(yMm, dpi);
      const i = (y * decoded.width + x) * 4;
      return Array.from(decoded.pixels.subarray(i, i + 3));
    };
    expect(await at(3 + 20, 3 + 30)).toEqual([255, 0, 0]);
    expect(await at(3 + 50, 3 + 30)).toEqual([0, 0, 255]);
    expect(await at(3 + 80, 3 + 30)).toEqual([0, 255, 0]);
    expect(await at(3 + 35, 3 + 30)).toEqual([255, 255, 255]); // gap between squares
  });

  it("PDF output embeds the raster and keeps the customer PDF as vector artwork", async () => {
    const result = await renderDocument({
      document: design(),
      format: "pdf",
      meta: { title: "t", date: new Date(0) },
      fonts,
      assets,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const raw = Buffer.from(result.bytes).toString("latin1");
    expect(raw).toMatch(/\/Subtype \/Image/); // PNG and rasterised SVG
    expect(raw).toMatch(/\/Subtype \/Form/); // the embedded PDF page (vector)

    // And it still renders correctly: rasterise our PDF and check the three colours.
    const { png, width } = await pdfPageToPng(result.bytes, { dpi: 100 });
    const decoded = await decodePng(png);
    const at = (xMm: number, yMm: number) => {
      const i = (mmToPx(yMm, 100) * width + mmToPx(xMm, 100)) * 4;
      return Array.from(decoded.pixels.subarray(i, i + 3));
    };
    expect(at(23, 33)).toEqual([255, 0, 0]);
    expect(at(53, 33)).toEqual([0, 0, 255]);
    expect(at(83, 33)).toEqual([0, 255, 0]);
  });

  it("warns below 150 DPI and blocks below 72 DPI", async () => {
    const meta = { title: "t", date: new Date(0) };
    const at = (trimW: number, trimH: number, w: number, h: number) => ({
      ...blankDocument({ trimW, trimH, bleed: 3, safeMargin: 3 }),
      elements: [image("logo", ids.png, 5, 5, w, h)],
    });
    const codes = (r: Awaited<ReturnType<typeof renderDocument>>) =>
      r.issues.map((i) => `${i.code}:${i.severity}`);

    // 600 px across 80 mm ≈ 190 DPI: fine.
    const fine = await renderDocument({
      document: at(100, 60, 80, 50),
      format: "pdf",
      meta,
      fonts,
      assets,
    });
    expect(fine.ok).toBe(true);
    expect(codes(fine)).toEqual([]);

    // 600 px across 120 mm ≈ 127 DPI: printed, with a warning.
    const soft = await renderDocument({
      document: at(200, 120, 120, 100),
      format: "pdf",
      meta,
      fonts,
      assets,
    });
    expect(soft.ok).toBe(true);
    expect(codes(soft)).toEqual(["low-resolution:warning"]);

    // 600 px across 380 mm ≈ 40 DPI: blocked.
    const blurry = await renderDocument({
      document: at(400, 300, 380, 280),
      format: "pdf",
      meta,
      fonts,
      assets,
    });
    expect(blurry.ok).toBe(false);
    expect(codes(blurry)).toEqual(["low-resolution:error"]);
  });

  it("refuses to print a design whose upload is missing", async () => {
    const result = await renderDocument({
      document: page([image("gone", "44444444-4444-4444-8444-444444444444", 10, 10, 20, 20)]),
      format: "pdf",
      meta: { title: "t", date: new Date(0) },
      fonts,
      assets,
    });
    expect(result.ok).toBe(false);
  });
});

/** Decode a PNG into RGBA pixels using @napi-rs/canvas (already a runtime dependency). */
async function decodePng(png: Uint8Array) {
  const { loadImage, createCanvas } = await import("@napi-rs/canvas");
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    pixels: ctx.getImageData(0, 0, image.width, image.height).data,
  };
}
