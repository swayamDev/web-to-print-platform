import { describe, expect, it } from "vitest";

import {
  clampCenter,
  constrainGeometry,
  fitsWithinLimits,
  limitsFor,
  rotatedHalfExtents,
} from "./constraints";
import { designDocumentSchema, type DesignDocument } from "./schema";
import { validateDocument } from "./validate";

const doc: DesignDocument = designDocumentSchema.parse({
  version: 1,
  unit: "mm",
  trim: { w: 100, h: 60 },
  bleed: 3,
  safeMargin: 3,
  background: { color: "#FFFFFF" },
  printAreas: [
    { id: "main", x: 0, y: 0, w: 100, h: 60, allowBleed: true },
    { id: "plate", x: 20, y: 10, w: 40, h: 20, allowBleed: false },
  ],
  elements: [
    { id: "band", type: "rect", areaId: "main", x: 0, y: 0, w: 100, h: 10, fill: "#FF4D00" },
    {
      id: "name",
      type: "text",
      areaId: "main",
      x: 10,
      y: 20,
      w: 40,
      h: 10,
      text: "A",
      fontId: "f",
      fontSize: 20,
      minFontSize: 8,
      maxFontSize: 20,
      color: "#121212",
    },
    { id: "tag", type: "rect", areaId: "plate", x: 25, y: 12, w: 10, h: 5, fill: "#121212" },
  ],
});
const el = (id: string) => doc.elements.find((e) => e.id === id)!;

describe("limitsFor", () => {
  it("lets shapes use the bleed but keeps text inside the safe area", () => {
    expect(limitsFor(doc, el("band"))).toEqual({ minX: -3, minY: -3, maxX: 103, maxY: 63 });
    expect(limitsFor(doc, el("name"))).toEqual({ minX: 3, minY: 3, maxX: 97, maxY: 57 });
  });

  it("keeps shapes in an inner area exactly inside it", () => {
    expect(limitsFor(doc, el("tag"))).toEqual({ minX: 20, minY: 10, maxX: 60, maxY: 30 });
  });
});

describe("rotatedHalfExtents", () => {
  it("is the plain half size unrotated and swaps at 90°", () => {
    expect(rotatedHalfExtents(40, 10, 0)).toEqual({ hx: 20, hy: 5 });
    const r = rotatedHalfExtents(40, 10, 90);
    expect(r.hx).toBeCloseTo(5, 9);
    expect(r.hy).toBeCloseTo(20, 9);
  });
});

describe("clampCenter (dragging)", () => {
  it("stops text at the safe margin instead of leaving the page", () => {
    // Requested centre far to the left: the 40 mm box stops with its left edge at 3 mm.
    expect(clampCenter(doc, el("name"), -50, 25)).toEqual({ cx: 23, cy: 25 });
    expect(clampCenter(doc, el("name"), 500, 500)).toEqual({ cx: 77, cy: 52 });
  });

  it("lets shapes run into the bleed but no further", () => {
    expect(clampCenter(doc, el("band"), 0, -100)).toEqual({ cx: 47, cy: 2 });
  });

  it("accounts for rotation", () => {
    const rotated = { ...el("name"), rotation: 90 };
    // Rotated, the box is 10 wide and 40 tall: centre y stays within 3 + 20 .. 57 - 20.
    const { cy } = clampCenter(doc, rotated, 30, 0);
    expect(cy).toBeCloseTo(23, 9);
  });
});

describe("constrainGeometry (resizing, rotating, nudging)", () => {
  it("pulls a nudged element back inside", () => {
    expect(constrainGeometry(doc, el("name"), { x: -20 })).toMatchObject({ x: 3, y: 20 });
  });

  it("refuses changes that cannot fit anywhere", () => {
    expect(constrainGeometry(doc, el("name"), { w: 200 })).toBeNull();
    // A 40 × 20 plate rotated 45° needs ~42 mm in each direction; the plate area is 20 tall.
    expect(
      constrainGeometry(doc, el("tag"), { w: 40, h: 20, x: 20, y: 10, rotation: 45 }),
    ).toBeNull();
  });

  it("everything it returns passes the server-side validation", () => {
    const cases = [
      { x: -20 },
      { y: 999 },
      { rotation: 30 },
      { w: 90, x: 50 },
      { rotation: 90, x: 80 },
    ];
    for (const change of cases) {
      const geometry = constrainGeometry(doc, el("name"), change);
      expect(geometry, JSON.stringify(change)).not.toBeNull();
      expect(fitsWithinLimits(doc, el("name"), geometry!)).toBe(true);
      const next = {
        ...doc,
        elements: doc.elements.map((e) => (e.id === "name" ? { ...e, ...geometry } : e)),
      };
      const positionIssues = validateDocument(next).filter((i) => i.code.startsWith("outside"));
      expect(positionIssues, JSON.stringify(change)).toEqual([]);
    }
  });
});
