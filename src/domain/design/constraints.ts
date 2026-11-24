import type { DesignDocument, DesignElement } from "./schema";
import { allowedBox, type Box } from "./validate";

/**
 * Interactive print-area constraints (PRD p5 §06: "editing is locked to defined print areas;
 * unprintable artwork cannot be created"). The designer runs every move, resize, rotation and
 * nudge through these before applying it, using the same boundaries as validateDocument, so the
 * canvas cannot produce a design the server would reject for its position.
 */

/** The box an element must stay inside, in trim millimetres. Text also keeps out of the margin. */
export function limitsFor(doc: DesignDocument, el: DesignElement): Box | null {
  const area = doc.printAreas.find((a) => a.id === el.areaId);
  if (!area) return null;
  const box = allowedBox(area, doc);
  if (el.type !== "text") return box;
  const s = doc.safeMargin;
  return {
    minX: Math.max(box.minX, s),
    minY: Math.max(box.minY, s),
    maxX: Math.min(box.maxX, doc.trim.w - s),
    maxY: Math.min(box.maxY, doc.trim.h - s),
  };
}

/** Half width and half height of an element's bounding box after rotation. */
export function rotatedHalfExtents(w: number, h: number, rotationDeg: number) {
  const r = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { hx: (w * c + h * s) / 2, hy: (w * s + h * c) / 2 };
}

const clamp = (v: number, min: number, max: number) =>
  min > max ? (min + max) / 2 : Math.min(max, Math.max(min, v));

/**
 * Keep an element's centre where its rotated box stays inside its limits. Returns the closest
 * allowed centre (trim mm) to the requested one.
 */
export function clampCenter(doc: DesignDocument, el: DesignElement, cx: number, cy: number) {
  const limits = limitsFor(doc, el);
  if (!limits) return { cx, cy };
  const { hx, hy } = rotatedHalfExtents(el.w, el.h, el.rotation ?? 0);
  return {
    cx: clamp(cx, limits.minX + hx, limits.maxX - hx),
    cy: clamp(cy, limits.minY + hy, limits.maxY - hy),
  };
}

type Geometry = Pick<DesignElement, "x" | "y" | "w" | "h" | "rotation">;
const EPS = 0.01;

/** Whether an element with this geometry sits entirely inside its limits. */
export function fitsWithinLimits(
  doc: DesignDocument,
  el: DesignElement,
  geometry: Partial<Geometry>,
): boolean {
  const next = { ...el, ...geometry } as DesignElement;
  const limits = limitsFor(doc, next);
  if (!limits) return false;
  const { hx, hy } = rotatedHalfExtents(next.w, next.h, next.rotation ?? 0);
  const cx = next.x + next.w / 2;
  const cy = next.y + next.h / 2;
  return (
    cx - hx >= limits.minX - EPS &&
    cx + hx <= limits.maxX + EPS &&
    cy - hy >= limits.minY - EPS &&
    cy + hy <= limits.maxY + EPS
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Apply a geometry change, moving the element back inside its limits if needed. Returns null
 * when the change cannot fit at all (e.g. a rotation that makes the box larger than the area),
 * in which case the designer keeps the previous geometry.
 */
export function constrainGeometry(
  doc: DesignDocument,
  el: DesignElement,
  geometry: Partial<Geometry>,
): Geometry | null {
  const next = { ...el, ...geometry } as DesignElement;
  const limits = limitsFor(doc, next);
  if (!limits) return null;
  const { hx, hy } = rotatedHalfExtents(next.w, next.h, next.rotation ?? 0);
  if (2 * hx > limits.maxX - limits.minX + EPS || 2 * hy > limits.maxY - limits.minY + EPS)
    return null;
  const { cx, cy } = clampCenter(doc, next, next.x + next.w / 2, next.y + next.h / 2);
  return {
    x: round(cx - next.w / 2),
    y: round(cy - next.h / 2),
    w: next.w,
    h: next.h,
    rotation: next.rotation ?? 0,
  };
}
