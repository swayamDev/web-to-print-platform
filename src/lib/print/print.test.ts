import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Resvg } from "@resvg/resvg-js";
import { PDFDocument, PDFName, PDFArray, PDFNumber } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { beforeAll, describe, expect, it } from "vitest";

import { layoutDocument } from "@/domain/design/layout";
import { designDocumentSchema, type DesignDocument } from "@/domain/design/schema";
import { mmToPt, mmToPx } from "@/domain/design/units";
import { validateDocument } from "@/domain/design/validate";

import { FONT_IDS, loadFont, type LoadedFont } from "./fonts";
import { renderPdf } from "./pdf";
import { readPngInfo, renderPng } from "./png";
import { layoutToSvg } from "./svg";

/**
 * Print preflight: proves the output files are genuinely print-ready (correct physical size,
 * bleed and trim boxes, embedded vector fonts, extractable text, exact pixel dimensions and
 * DPI), not screenshots. Uses the real fonts and the real templates from supabase/seed.sql.
 */

const root = process.cwd();
const fonts = new Map<string, LoadedFont>();
const lookup = (id: string) => fonts.get(id)?.metrics;

/** The six template documents embedded in seed.sql between $json$ markers. */
function seedTemplates(): DesignDocument[] {
  const sql = readFileSync(join(root, "supabase/seed.sql"), "utf8");
  return [...sql.matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map((m) =>
    designDocumentSchema.parse(JSON.parse(m[1]!)),
  );
}

const raceBib = () => seedTemplates().find((t) => t.trim.w === 148 && t.trim.h === 210)!;
const fixedDate = new Date("2026-11-23T00:00:00Z");
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function pdfText(bytes: Uint8Array) {
  const pdf = await getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    disableFontFace: true,
  }).promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  return content.items.map((i) => ("str" in i ? i.str : "")).join(" ");
}

function box(page: ReturnType<PDFDocument["getPage"]>, name: "MediaBox" | "TrimBox" | "BleedBox") {
  const array = page.node.lookup(PDFName.of(name), PDFArray);
  return array.asArray().map((n) => (n as PDFNumber).asNumber());
}

beforeAll(() => {
  for (const id of FONT_IDS) {
    fonts.set(
      id,
      loadFont(id, new Uint8Array(readFileSync(join(root, "public/fonts", `${id}.ttf`)))),
    );
  }
});

describe("seed templates", () => {
  it("all six templates are valid, printable documents", () => {
    const templates = seedTemplates();
    expect(templates).toHaveLength(6);
    for (const doc of templates) {
      const layout = layoutDocument(doc, {}, lookup);
      expect(validateDocument(doc, layout), JSON.stringify(doc.trim)).toEqual([]);
    }
  });

  it("a very long runner name is fitted with real font metrics", () => {
    const doc = raceBib();
    const layout = layoutDocument(
      doc,
      { NAME: "MAXIMILIANA WOLFESCHLEGELSTEIN", BIB: "1234" },
      lookup,
    );
    const name = layout.items.find((i) => i.id === "name");
    if (name?.kind !== "text") throw new Error("no name");
    expect(name.fits).toBe(true);
    expect(name.adjusted).toBe(true);
    expect(name.fontSizePt).toBeLessThan(48);
    expect(name.fontSizePt).toBeGreaterThanOrEqual(20);
    expect(name.widthMm).toBeLessThanOrEqual(132);
  });

  it("text that cannot fit at the minimum size, or uses unsupported characters, blocks printing", () => {
    const doc = raceBib();
    const layout = layoutDocument(doc, { NAME: "A".repeat(80), BIB: "Ω1" }, lookup);
    expect(
      validateDocument(doc, layout)
        .map((i) => `${i.elementId}:${i.code}`)
        .sort(),
    ).toEqual(["bib:missing-glyphs", "name:overflow"]);
  });
});

describe("PDF preflight (A5 race number, 3 mm bleed)", () => {
  let bytes: Uint8Array;

  beforeAll(async () => {
    const layout = layoutDocument(raceBib(), { BIB: "0213", NAME: "PRIYA SHAH" }, lookup);
    bytes = await renderPdf(layout, fonts, {
      title: "Race number",
      keywords: ["snapshot:abc"],
      date: fixedDate,
    });
  });

  it("is A5 plus 3 mm bleed on every side, with matching bleed and trim boxes", async () => {
    const page = (await PDFDocument.load(bytes)).getPage(0);
    const close = (actual: number[], expected: number[]) =>
      actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 2));
    // 154 × 216 mm = 436.54 × 612.28 pt
    close(box(page, "MediaBox"), [0, 0, mmToPt(154), mmToPt(216)]);
    close(box(page, "BleedBox"), [0, 0, mmToPt(154), mmToPt(216)]);
    // PDF boxes are [left, bottom, right, top]: the trim sits 3 mm in from every edge.
    close(box(page, "TrimBox"), [mmToPt(3), mmToPt(3), mmToPt(151), mmToPt(213)]);
  });

  it("embeds real font programs (vector text, not an image)", () => {
    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw).toContain("/FontFile2");
    expect(raw).not.toContain("/Subtype /Image");
  });

  it("has text a printer or search tool can extract", async () => {
    const text = (await pdfText(bytes)).replace(/\s+/g, "");
    expect(text).toContain("0213");
    expect(text).toContain("PRIYASHAH");
    expect(text).toContain("CITY10K2026");
  });

  it("is deterministic: the same design always produces the same file", async () => {
    const layout = layoutDocument(raceBib(), { BIB: "0213", NAME: "PRIYA SHAH" }, lookup);
    const again = await renderPdf(layout, fonts, {
      title: "Race number",
      keywords: ["snapshot:abc"],
      date: fixedDate,
    });
    expect(sha(again)).toBe(sha(bytes));
  });

  it("records the approval snapshot in the metadata", async () => {
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getKeywords()).toContain("snapshot:abc");
  });
});

describe("PNG preflight", () => {
  it("has exact pixel dimensions and DPI for the physical size", () => {
    const layout = layoutDocument(raceBib(), { BIB: "0213", NAME: "PRIYA SHAH" }, lookup);
    const png = renderPng(layoutToSvg(layout, fonts), layout.pageWidthMm, 300);
    expect(readPngInfo(png)).toEqual({
      width: mmToPx(154, 300),
      height: mmToPx(216, 300),
      dpi: 300,
    });
    expect(readPngInfo(png)).toEqual({ width: 1819, height: 2551, dpi: 300 });
  });

  it("puts the artwork where the layout says (band colour, bleed, dark number)", () => {
    const layout = layoutDocument(raceBib(), { BIB: "8888", NAME: "PRIYA SHAH" }, lookup);
    const dpi = 100;
    const image = new Resvg(layoutToSvg(layout, fonts), {
      fitTo: { mode: "width", value: mmToPx(layout.pageWidthMm, dpi) },
    }).render();
    const px = (xMm: number, yMm: number) => {
      const x = mmToPx(xMm, dpi);
      const y = mmToPx(yMm, dpi);
      const i = (y * image.width + x) * 4;
      return Array.from(image.pixels.subarray(i, i + 3));
    };
    // The orange band runs into the bleed at the very top-left corner.
    expect(px(0.5, 0.5)).toEqual([255, 77, 0]);
    // Below the band the background is white.
    expect(px(10, 40)).toEqual([255, 255, 255]);
    // The bib number area contains dark ink.
    let dark = 0;
    for (let x = 20; x < 135; x += 1) {
      const [r, g, b] = px(x, 95);
      if (r! < 80 && g! < 80 && b! < 80) dark++;
    }
    expect(dark).toBeGreaterThan(20);
  });

  it("can draw proof guides without changing the print file", () => {
    const layout = layoutDocument(raceBib(), {}, lookup);
    const plain = layoutToSvg(layout, fonts);
    const proof = layoutToSvg(layout, fonts, { guides: { safeMarginMm: 3 } });
    expect(plain).not.toContain('id="guides"');
    expect(proof).toContain('id="guides"');
  });

  it("draws a centred, rotated proof watermark only when asked", () => {
    const layout = layoutDocument(raceBib(), {}, lookup);
    const plain = layoutToSvg(layout, fonts);
    const proof = layoutToSvg(layout, fonts, {
      watermark: { text: "PROOF", font: fonts.get("inter-semibold")! },
    });
    expect(plain).not.toContain('id="watermark"');
    expect(proof).toMatch(/<path id="watermark" d="M[^"]+" [^>]*transform="rotate\(-/);
  });
});
