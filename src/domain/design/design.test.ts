import { describe, expect, it } from "vitest";

import { productionFileName, productionFilePath } from "../files";

import { layoutDocument } from "./layout";
import { designDocumentSchema, type DesignDocument } from "./schema";
import { fitText, measureLine, type FontMetrics } from "./text";
import { mmToPt, mmToPx, ptToMm } from "./units";
import { validateDocument } from "./validate";

/** A fake monospace font: every character is 0.5 em wide; "Ω" is not in the font. */
const mono: FontMetrics = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  advanceOf: (char) => (char === "Ω" ? null : 500),
};

describe("units", () => {
  it("converts between millimetres, points and pixels", () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 10);
    expect(ptToMm(72)).toBeCloseTo(25.4, 10);
    expect(mmToPx(54, 300)).toBe(638); // 50 mm sticker + 2 × 2 mm bleed
    expect(mmToPx(154, 300)).toBe(1819); // A5 + 2 × 3 mm bleed
  });
});

describe("measureLine", () => {
  it("adds tracking between characters but not after the last", () => {
    // 4 chars × 500 units at 10 pt = 20 pt; tracking 100/1000 em × 10 pt × 3 gaps = 3 pt
    const line = measureLine("ABCD", 10, 100, mono);
    expect(line.widthMm).toBeCloseTo(ptToMm(23), 6);
    expect(line.heightMm).toBeCloseTo(ptToMm(10), 6);
  });

  it("reports characters the font cannot print", () => {
    expect(measureLine("AΩB", 10, 0, mono).missingChars).toEqual(["Ω"]);
  });
});

describe("fitText", () => {
  const rules = {
    maxFontSize: 40,
    minFontSize: 10,
    tracking: 0,
    minTracking: -50,
    fit: "shrink" as const,
  };

  it("keeps the maximum size when the text already fits", () => {
    const fit = fitText("ABC", 100, 30, rules, mono);
    expect(fit).toMatchObject({ fontSizePt: 40, trackingPerMille: 0, fits: true, adjusted: false });
  });

  it("tightens tracking before reducing the size", () => {
    // 10 chars at 40 pt = 200 pt = 70.6 mm wide. Box 68 mm: tracking alone can save
    // 9 gaps × 0.05 × 40 pt = 18 pt, enough without shrinking.
    const fit = fitText("ABCDEFGHIJ", 68, 30, rules, mono);
    expect(fit.fontSizePt).toBe(40);
    expect(fit.trackingPerMille).toBeLessThan(0);
    expect(fit.widthMm).toBeLessThanOrEqual(68);
    expect(fit.adjusted).toBe(true);
  });

  it("shrinks long text to fit, never below the minimum", () => {
    const fit = fitText("A VERY LONG RUNNER NAME", 60, 30, rules, mono);
    expect(fit.fits).toBe(true);
    expect(fit.fontSizePt).toBeLessThan(40);
    expect(fit.fontSizePt).toBeGreaterThanOrEqual(10);
    expect(fit.widthMm).toBeLessThanOrEqual(60);
  });

  it("also respects the box height", () => {
    // Line box = 1 em; a 5 mm tall box allows at most ~14 pt.
    const fit = fitText("A", 100, 5, rules, mono);
    expect(fit.heightMm).toBeLessThanOrEqual(5);
    expect(fit.fontSizePt).toBeLessThanOrEqual(14.5);
  });

  it("reports overflow instead of shrinking past the minimum", () => {
    const fit = fitText("X".repeat(200), 50, 30, rules, mono);
    expect(fit).toMatchObject({ fits: false, fontSizePt: 10, trackingPerMille: -50 });
  });

  it("with fit 'none' uses the maximum size as-is", () => {
    const fit = fitText("ABCDEFGHIJ", 10, 30, { ...rules, fit: "none" }, mono);
    expect(fit).toMatchObject({ fontSizePt: 40, fits: false, adjusted: false });
  });
});

const baseDoc: DesignDocument = designDocumentSchema.parse({
  version: 1,
  unit: "mm",
  trim: { w: 100, h: 60 },
  bleed: 3,
  safeMargin: 3,
  background: { color: "#FFFFFF" },
  printAreas: [{ id: "main", x: 0, y: 0, w: 100, h: 60, shape: "rect", allowBleed: true }],
  elements: [
    { id: "band", type: "rect", areaId: "main", x: -3, y: -3, w: 106, h: 15, fill: "#FF4D00" },
    {
      id: "name",
      type: "text",
      areaId: "main",
      x: 10,
      y: 20,
      w: 80,
      h: 20,
      placeholderKey: "NAME",
      text: "SAMPLE",
      fontId: "mono",
      fontSize: 30,
      minFontSize: 8,
      maxFontSize: 30,
      align: "center",
      color: "#121212",
    },
  ],
});

const withElements = (patch: (doc: DesignDocument) => void) => {
  const doc = structuredClone(baseDoc);
  patch(doc);
  return doc;
};

const fonts = (id: string) => (id === "mono" ? mono : undefined);

describe("layoutDocument", () => {
  it("offsets everything by the bleed and centres text in its box", () => {
    const layout = layoutDocument(baseDoc, { NAME: "AB" }, fonts);
    expect(layout).toMatchObject({
      pageWidthMm: 106,
      pageHeightMm: 66,
      trim: { x: 3, y: 3, w: 100, h: 60 },
    });
    const text = layout.items.find((i) => i.kind === "text");
    expect(text?.kind === "text" && text.text).toBe("AB");
    if (text?.kind !== "text") throw new Error("no text");
    // centred horizontally inside x 13..93
    expect(text.originX + text.widthMm / 2).toBeCloseTo(53, 6);
    expect(text.centerX).toBeCloseTo(53, 6);
    expect(layout.issues).toEqual([]);
  });

  it("uses the template text when no value is supplied", () => {
    const text = layoutDocument(baseDoc, {}, fonts).items.find((i) => i.kind === "text");
    expect(text?.kind === "text" && text.text).toBe("SAMPLE");
  });

  it("flags text that cannot fit and characters the font lacks", () => {
    const layout = layoutDocument(baseDoc, { NAME: `${"W".repeat(60)}Ω` }, fonts);
    expect(layout.issues.map((i) => i.code).sort()).toEqual(["missing-glyphs", "overflow"]);
  });

  it("flags unknown fonts", () => {
    const doc = withElements((d) => {
      const el = d.elements[1]!;
      if (el.type === "text") el.fontId = "comic-sans";
    });
    expect(layoutDocument(doc, {}, fonts).issues[0]?.code).toBe("unknown-font");
  });
});

describe("validateDocument (print-area constraints)", () => {
  const issuesFor = (doc: DesignDocument) =>
    validateDocument(doc, layoutDocument(doc, {}, fonts)).map((i) => `${i.elementId}:${i.code}`);

  it("accepts a design inside its areas, with shapes running into the bleed", () => {
    expect(issuesFor(baseDoc)).toEqual([]);
  });

  it("rejects an element dragged outside the printable area", () => {
    expect(issuesFor(withElements((d) => (d.elements[1]!.x = 50)))).toEqual(["name:outside-area"]);
  });

  it("rejects shapes in the bleed when the area does not allow it", () => {
    const doc = withElements((d) => (d.printAreas[0]!.allowBleed = false));
    expect(issuesFor(doc)).toEqual(["band:outside-area"]);
  });

  it("keeps text out of the trim margin even inside the area", () => {
    expect(issuesFor(withElements((d) => (d.elements[1]!.x = 1)))).toEqual([
      "name:outside-safe-area",
    ]);
  });

  it("accounts for rotation: a box that fits flat can poke out when rotated", () => {
    const flat = withElements((d) => {
      Object.assign(d.elements[1]!, { x: 4, y: 20, w: 92, h: 20, rotation: 0 });
    });
    expect(issuesFor(flat)).toEqual([]);
    const rotated = withElements((d) => {
      Object.assign(d.elements[1]!, { x: 4, y: 20, w: 92, h: 20, rotation: 45 });
    });
    expect(issuesFor(rotated)).toEqual(["name:outside-area"]);
  });

  it("rejects tampered documents that reference a missing area", () => {
    expect(issuesFor(withElements((d) => (d.elements[1]!.areaId = "nowhere")))).toEqual([
      "name:unknown-area",
    ]);
  });

  it("the schema rejects malformed documents", () => {
    expect(designDocumentSchema.safeParse({ ...baseDoc, version: 2 }).success).toBe(false);
    const duplicate = { ...baseDoc, elements: [baseDoc.elements[0], baseDoc.elements[0]] };
    expect(designDocumentSchema.safeParse(duplicate).success).toBe(false);
    const badColour = withElements((d) => ((d.elements[0] as { fill: string }).fill = "orange"));
    expect(designDocumentSchema.safeParse(badColour).success).toBe(false);
  });
});

describe("production file names (PRD p6 §07)", () => {
  const date = new Date("2026-11-23T22:30:00Z");

  it("follows OrderID_ProductType_Date_Output in an order folder", () => {
    const f = {
      orderNumber: "DH-2026-000123",
      productSlug: "race-numbers",
      date,
      output: "print",
      extension: "pdf",
    } as const;
    expect(productionFileName(f)).toBe("DH-2026-000123_race-numbers_2026-11-23_print.pdf");
    expect(productionFilePath(f)).toBe(
      "DH-2026-000123/DH-2026-000123_race-numbers_2026-11-23_print.pdf",
    );
  });

  it("numbers CSV rows so they sort, in a rows subfolder", () => {
    const f = {
      orderNumber: "DH-2026-000123",
      productSlug: "race-numbers",
      date,
      output: "print",
      extension: "png",
      rowIndex: 213,
    } as const;
    expect(productionFilePath(f)).toBe(
      "DH-2026-000123/rows/DH-2026-000123_race-numbers_2026-11-23_row-0213_print.png",
    );
  });

  it("refuses unsafe names", () => {
    expect(() =>
      productionFileName({
        orderNumber: "../x",
        productSlug: "a",
        date,
        output: "print",
        extension: "pdf",
      }),
    ).toThrow();
  });
});
