import type { DesignDocument, DesignElement, RectElement, TextElement } from "./schema";
import { mmToPt } from "./units";

/**
 * Pure operations on design documents used by the designer (and safe to run on the server).
 * Every function returns a new document; nothing is mutated.
 */

export type PrintSpec = { trimW: number; trimH: number; bleed: number; safeMargin: number };

/** An empty design for a product size: one print area covering the trim, bleed allowed. */
export function blankDocument(spec: PrintSpec): DesignDocument {
  return {
    version: 1,
    unit: "mm",
    trim: { w: spec.trimW, h: spec.trimH },
    bleed: spec.bleed,
    safeMargin: spec.safeMargin,
    background: { color: "#FFFFFF" },
    printAreas: [
      { id: "main", x: 0, y: 0, w: spec.trimW, h: spec.trimH, shape: "rect", allowBleed: true },
    ],
    elements: [],
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Fit a template designed at one size to the size the customer configured (DECISIONS D-29):
 * positions and boxes scale with the page on each axis; type scales by the smaller factor so
 * text never grows out of proportion. Bleed and safe margin always come from the product.
 */
export function fitDocumentToSize(doc: DesignDocument, spec: PrintSpec): DesignDocument {
  const sx = spec.trimW / doc.trim.w;
  const sy = spec.trimH / doc.trim.h;
  const s = Math.min(sx, sy);
  const scaleX = (v: number) => round(v * sx);
  const scaleY = (v: number) => round(v * sy);
  // Elements anchored in the old bleed stay anchored in the new one.
  const edgeX = (x: number) => (x < 0 ? -spec.bleed : scaleX(x));
  const edgeY = (y: number) => (y < 0 ? -spec.bleed : scaleY(y));

  return {
    ...doc,
    trim: { w: spec.trimW, h: spec.trimH },
    bleed: spec.bleed,
    safeMargin: spec.safeMargin,
    printAreas: doc.printAreas.map((a) => ({
      ...a,
      x: scaleX(a.x),
      y: scaleY(a.y),
      w: scaleX(a.w),
      h: scaleY(a.h),
    })),
    elements: doc.elements.map((el) => {
      const x = edgeX(el.x);
      const y = edgeY(el.y);
      // Keep full-bleed shapes reaching past the far edges too.
      const right = el.x + el.w > doc.trim.w ? spec.trimW + spec.bleed : scaleX(el.x + el.w);
      const bottom = el.y + el.h > doc.trim.h ? spec.trimH + spec.bleed : scaleY(el.y + el.h);
      const moved = { ...el, x, y, w: round(right - x), h: round(bottom - y) };
      if (moved.type !== "text") return moved;
      return {
        ...moved,
        fontSize: round(moved.fontSize * s),
        minFontSize: round(moved.minFontSize * s),
        maxFontSize: round(moved.maxFontSize * s),
      };
    }),
  };
}

/** A new element id that is not used yet: "text-1", "text-2", … */
export function nextElementId(doc: DesignDocument, prefix: string): string {
  const used = new Set(doc.elements.map((e) => e.id));
  for (let i = 1; ; i++) if (!used.has(`${prefix}-${i}`)) return `${prefix}-${i}`;
}

/** Add a text box centred inside the safe area, sized to the page. */
export function addText(
  doc: DesignDocument,
  text = "Your text",
): { doc: DesignDocument; id: string } {
  const safe = doc.safeMargin;
  const w = round((doc.trim.w - 2 * safe) * 0.8);
  const h = round(Math.min((doc.trim.h - 2 * safe) * 0.25, 40));
  // Largest size whose line box fits the height (≈1.25 em), capped at 72 pt.
  const max = Math.max(6, Math.min(72, Math.floor(mmToPt(h) / 1.25)));
  const id = nextElementId(doc, "text");
  const element: TextElement = {
    id,
    type: "text",
    areaId: doc.printAreas[0]!.id,
    x: round((doc.trim.w - w) / 2),
    y: round((doc.trim.h - h) / 2),
    w,
    h,
    rotation: 0,
    text,
    fontId: "inter-semibold",
    fontSize: max,
    maxFontSize: max,
    minFontSize: Math.max(4, Math.round(max / 3)),
    tracking: 0,
    minTracking: -40,
    fit: "shrink",
    align: "center",
    color: "#121212",
  };
  return { doc: { ...doc, elements: [...doc.elements, element] }, id };
}

/** Add a filled rectangle in the middle of the page. */
export function addRect(
  doc: DesignDocument,
  fill = "#FF4D00",
): { doc: DesignDocument; id: string } {
  const w = round(doc.trim.w * 0.4);
  const h = round(doc.trim.h * 0.2);
  const id = nextElementId(doc, "shape");
  const element: RectElement = {
    id,
    type: "rect",
    areaId: doc.printAreas[0]!.id,
    x: round((doc.trim.w - w) / 2),
    y: round((doc.trim.h - h) / 2),
    w,
    h,
    rotation: 0,
    fill,
  };
  // Shapes go underneath existing text.
  const firstText = doc.elements.findIndex((e) => e.type === "text");
  const elements = [...doc.elements];
  elements.splice(firstText === -1 ? elements.length : firstText, 0, element);
  return { doc: { ...doc, elements }, id };
}

type ElementPatch = Partial<Omit<TextElement, "type" | "id">> &
  Partial<Omit<RectElement, "type" | "id">>;

export function updateElement(
  doc: DesignDocument,
  id: string,
  patch: ElementPatch,
): DesignDocument {
  return {
    ...doc,
    elements: doc.elements.map((el) =>
      el.id === id ? ({ ...el, ...patch } as DesignElement) : el,
    ),
  };
}

export function removeElement(doc: DesignDocument, id: string): DesignDocument {
  return { ...doc, elements: doc.elements.filter((el) => el.id !== id) };
}

/** Move an element one step up (towards the front) or down in the stacking order. */
export function moveElement(
  doc: DesignDocument,
  id: string,
  direction: "up" | "down",
): DesignDocument {
  const index = doc.elements.findIndex((el) => el.id === id);
  const target = direction === "up" ? index + 1 : index - 1;
  if (index === -1 || target < 0 || target >= doc.elements.length) return doc;
  const elements = [...doc.elements];
  [elements[index], elements[target]] = [elements[target]!, elements[index]!];
  return { ...doc, elements };
}
