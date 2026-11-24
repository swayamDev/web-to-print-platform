import { describe, expect, it } from "vitest";

import {
  addRect,
  addText,
  blankDocument,
  fitDocumentToSize,
  moveElement,
  placeArtwork,
  placeImage,
  removeElement,
  updateElement,
} from "./document";
import { designDocumentSchema, type DesignDocument } from "./schema";
import { validateDocument } from "./validate";

const spec = { trimW: 100, trimH: 60, bleed: 3, safeMargin: 3 };

const template: DesignDocument = designDocumentSchema.parse({
  version: 1,
  unit: "mm",
  trim: { w: 148, h: 210 },
  bleed: 3,
  safeMargin: 3,
  background: { color: "#FFFFFF" },
  printAreas: [{ id: "main", x: 0, y: 0, w: 148, h: 210, allowBleed: true }],
  elements: [
    { id: "band", type: "rect", areaId: "main", x: -3, y: -3, w: 154, h: 33, fill: "#FF4D00" },
    {
      id: "bib",
      type: "text",
      areaId: "main",
      x: 8,
      y: 42,
      w: 132,
      h: 95,
      text: "1234",
      fontId: "sora-bold",
      fontSize: 240,
      minFontSize: 90,
      maxFontSize: 240,
      color: "#121212",
    },
  ],
});

describe("blankDocument", () => {
  it("covers the trim with one print area that allows bleed", () => {
    const doc = blankDocument(spec);
    expect(designDocumentSchema.safeParse(doc).success).toBe(true);
    expect(doc.printAreas).toEqual([
      { id: "main", x: 0, y: 0, w: 100, h: 60, shape: "rect", allowBleed: true },
    ]);
  });
});

describe("fitDocumentToSize", () => {
  it("returns an equivalent document at the template's own size", () => {
    expect(
      fitDocumentToSize(template, { trimW: 148, trimH: 210, bleed: 3, safeMargin: 3 }),
    ).toEqual(template);
  });

  it("scales A5 to A6, keeping full-bleed shapes full-bleed and type proportional", () => {
    const a6 = fitDocumentToSize(template, { trimW: 105, trimH: 148, bleed: 3, safeMargin: 3 });
    const band = a6.elements[0]!;
    expect(band).toMatchObject({ x: -3, y: -3, w: 111 }); // still reaches both side bleeds
    const bib = a6.elements[1]!;
    if (bib.type !== "text") throw new Error("text expected");
    const s = Math.min(105 / 148, 148 / 210);
    expect(bib.maxFontSize).toBeCloseTo(240 * s, 1);
    expect(bib.minFontSize).toBeCloseTo(90 * s, 1);
    expect(validateDocument(a6)).toEqual([]);
  });

  it("takes bleed and safe margin from the product", () => {
    const doc = fitDocumentToSize(template, { trimW: 148, trimH: 210, bleed: 2, safeMargin: 4 });
    expect(doc).toMatchObject({ bleed: 2, safeMargin: 4 });
    expect(doc.elements[0]).toMatchObject({ x: -2, y: -2 });
  });
});

describe("element operations", () => {
  it("adds text centred in the safe area that passes validation", () => {
    const { doc, id } = addText(blankDocument(spec));
    expect(id).toBe("text-1");
    expect(designDocumentSchema.safeParse(doc).success).toBe(true);
    expect(validateDocument(doc)).toEqual([]);
    expect(addText(doc).id).toBe("text-2");
  });

  it("adds shapes underneath text", () => {
    const withText = addText(blankDocument(spec)).doc;
    const { doc, id } = addRect(withText);
    expect(doc.elements.map((e) => e.id)).toEqual([id, "text-1"]);
  });

  it("updates, reorders and removes elements without mutating the original", () => {
    const start = addRect(addText(blankDocument(spec)).doc).doc;
    const moved = updateElement(start, "text-1", { x: 10, text: "Hello" });
    expect(moved.elements.find((e) => e.id === "text-1")).toMatchObject({ x: 10, text: "Hello" });
    expect(start.elements.find((e) => e.id === "text-1")).not.toMatchObject({ x: 10 });

    expect(moveElement(start, "shape-1", "up").elements.map((e) => e.id)).toEqual([
      "text-1",
      "shape-1",
    ]);
    expect(moveElement(start, "shape-1", "down")).toBe(start); // already at the bottom
    expect(removeElement(start, "shape-1").elements.map((e) => e.id)).toEqual(["text-1"]);
  });
});

describe("placing uploads", () => {
  const asset = (widthPx: number, heightPx: number, page?: { mediaW: number; mediaH: number }) => ({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    widthPx,
    heightPx,
    ...(page ? { pageSizeMm: page } : {}),
  });

  it("fits a logo inside a template's logo slot, keeping its proportions", () => {
    const withSlot: DesignDocument = {
      ...blankDocument(spec),
      elements: [
        {
          id: "logo",
          type: "image",
          areaId: "main",
          x: 10,
          y: 10,
          w: 40,
          h: 20,
          rotation: 0,
          assetId: null,
        },
      ],
    };
    const { doc, id } = placeImage(withSlot, asset(1000, 1000), "logo");
    expect(id).toBe("logo");
    expect(doc.elements[0]).toMatchObject({ x: 20, y: 10, w: 20, h: 20, assetId: asset(1, 1).id });
  });

  it("adds a new logo centred at up to half the safe area", () => {
    const { doc } = placeImage(blankDocument(spec), asset(2000, 1000));
    // safe area 94 × 54 → half 47 × 27; a 2:1 logo fits as 47 × 23.5, centred on (50, 30)
    expect(doc.elements[0]).toMatchObject({ x: 26.5, y: 18.25, w: 47, h: 23.5 });
    expect(validateDocument(doc)).toEqual([]);
  });

  it("puts artwork that includes bleed over the whole bleed box", () => {
    const { doc, notes } = placeArtwork(
      blankDocument(spec),
      asset(300, 186, { mediaW: 106, mediaH: 66 }),
    );
    expect(doc.elements[0]).toMatchObject({ x: -3, y: -3, w: 106, h: 66, role: "artwork" });
    expect(notes).toEqual([]);
  });

  it("explains when artwork has no bleed", () => {
    const { doc, notes } = placeArtwork(
      blankDocument(spec),
      asset(283, 170, { mediaW: 100, mediaH: 60 }),
    );
    expect(doc.elements[0]).toMatchObject({ x: 0, y: 0, w: 100, h: 60 });
    expect(notes[0]).toMatch(/no bleed/);
  });

  it("scales artwork of the wrong size to fit, and says so", () => {
    const { doc, notes } = placeArtwork(blankDocument(spec), asset(1000, 1000));
    expect(doc.elements[0]).toMatchObject({ w: 66, h: 66 });
    expect(notes[0]).toMatch(/proportions differ/);
    expect(validateDocument(doc)).toEqual([]);
  });

  it("puts artwork underneath existing text", () => {
    const start = addText(blankDocument(spec)).doc;
    const { doc } = placeArtwork(start, asset(300, 186, { mediaW: 106, mediaH: 66 }));
    expect(doc.elements.map((e) => e.type)).toEqual(["image", "text"]);
  });
});
