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

// ---------------------------------------------------------------------------
// Uploaded images
// ---------------------------------------------------------------------------

/** Proportions of an uploaded file: what the drawing's width / height is. */
type Proportions = { widthPx: number; heightPx: number };

/** Largest box with the asset's proportions that fits inside (w × h), centred on (cx, cy). */
function containBox(asset: Proportions, cx: number, cy: number, w: number, h: number) {
  const ratio = asset.widthPx / asset.heightPx;
  const width = Math.min(w, h * ratio);
  const height = width / ratio;
  return { x: round(cx - width / 2), y: round(cy - height / 2), w: round(width), h: round(height) };
}

/**
 * Put an uploaded logo into the design: into the given image slot (fitted inside the slot,
 * keeping its proportions), or as a new image centred in the safe area at up to half its size.
 */
export function placeImage(
  doc: DesignDocument,
  asset: Proportions & { id: string },
  slotId?: string | null,
): { doc: DesignDocument; id: string } {
  const slot = slotId ? doc.elements.find((e) => e.id === slotId && e.type === "image") : undefined;
  if (slot) {
    const box = containBox(asset, slot.x + slot.w / 2, slot.y + slot.h / 2, slot.w, slot.h);
    return {
      doc: updateElement(doc, slot.id, { ...box, assetId: asset.id } as never),
      id: slot.id,
    };
  }
  const s = doc.safeMargin;
  const box = containBox(
    asset,
    doc.trim.w / 2,
    doc.trim.h / 2,
    (doc.trim.w - 2 * s) / 2,
    (doc.trim.h - 2 * s) / 2,
  );
  const id = nextElementId(doc, "image");
  const element: DesignElement = {
    id,
    type: "image",
    areaId: doc.printAreas[0]!.id,
    ...box,
    rotation: 0,
    assetId: asset.id,
  };
  return { doc: { ...doc, elements: [...doc.elements, element] }, id };
}

const close = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

/**
 * Place finished, full-page artwork (PDF, AI, SVG or image) behind everything else:
 *  - if it is the size of the page including bleed, it covers the bleed box (ideal);
 *  - if it is the trim size, it covers the trim and the customer is told there is no bleed;
 *  - otherwise it is fitted inside the page and the customer is told the proportions differ.
 */
export function placeArtwork(
  doc: DesignDocument,
  asset: Proportions & { id: string; pageSizeMm?: { mediaW: number; mediaH: number } },
): { doc: DesignDocument; id: string; notes: string[] } {
  const b = doc.bleed;
  const full = { w: doc.trim.w + 2 * b, h: doc.trim.h + 2 * b };
  const notes: string[] = [];
  let box: { x: number; y: number; w: number; h: number };

  const fileW = asset.pageSizeMm?.mediaW;
  const fileH = asset.pageSizeMm?.mediaH;
  const ratio = asset.widthPx / asset.heightPx;
  const matches = (w: number, h: number) =>
    fileW !== undefined && fileH !== undefined
      ? close(fileW, w, 1) && close(fileH, h, 1)
      : close(ratio, w / h, (w / h) * 0.015);

  if (matches(full.w, full.h)) {
    box = { x: -b, y: -b, w: full.w, h: full.h };
  } else if (matches(doc.trim.w, doc.trim.h)) {
    box = { x: 0, y: 0, w: doc.trim.w, h: doc.trim.h };
    if (b > 0) {
      notes.push(
        `Your file is the finished size with no bleed. For colour to the edge, add ${b} mm of bleed on every side (${round(full.w)} × ${round(full.h)} mm).`,
      );
    }
  } else {
    box = containBox(asset, doc.trim.w / 2, doc.trim.h / 2, full.w, full.h);
    notes.push(
      fileW !== undefined && fileH !== undefined
        ? `Your file is ${round(fileW)} × ${round(fileH)} mm; this product is ${round(doc.trim.w)} × ${round(doc.trim.h)} mm (${round(full.w)} × ${round(full.h)} mm with bleed). It has been scaled to fit.`
        : `Your file's proportions differ from this product's, so it has been scaled to fit inside the page.`,
    );
  }

  const id = nextElementId(doc, "artwork");
  const element: DesignElement = {
    id,
    type: "image",
    areaId: doc.printAreas[0]!.id,
    ...box,
    rotation: 0,
    assetId: asset.id,
    role: "artwork",
  };
  return { doc: { ...doc, elements: [element, ...doc.elements] }, id, notes };
}
