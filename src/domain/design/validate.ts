import type { DesignLayout, LayoutIssue } from "./layout";
import { rotatePoint } from "./layout";
import type { DesignDocument, DesignElement, PrintArea } from "./schema";

/**
 * Print-area constraints (PRD p5 §06: "unprintable artwork cannot be created").
 *
 * The designer prevents these interactively; this check runs on the server on every save,
 * proof and checkout, so a hand-edited or tampered document is rejected too.
 *
 *  - every element must sit inside its print area (rotation included);
 *  - areas marked allowBleed let shapes run into the bleed where the area meets the trim edge;
 *  - text must also stay inside the safe area (trim inset by the safe margin);
 *  - text must fit its box and use characters the font can print (from the layout).
 */

export type DesignIssue = {
  elementId: string;
  code: "unknown-area" | "outside-area" | "outside-safe-area" | LayoutIssue["code"];
  message: string;
};

export type Box = { minX: number; minY: number; maxX: number; maxY: number };
const EPS = 0.01; // mm

function cornersOf(el: DesignElement) {
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const rotation = el.rotation ?? 0;
  return [
    [el.x, el.y],
    [el.x + el.w, el.y],
    [el.x + el.w, el.y + el.h],
    [el.x, el.y + el.h],
  ].map(([px, py]) => rotatePoint(px!, py!, cx, cy, rotation));
}

/** Where shapes in an area may go: the area, extended into the bleed where it meets the trim. */
export function allowedBox(area: PrintArea, doc: DesignDocument): Box {
  const box = { minX: area.x, minY: area.y, maxX: area.x + area.w, maxY: area.y + area.h };
  if (!area.allowBleed) return box;
  const b = doc.bleed;
  if (area.x <= EPS) box.minX = -b;
  if (area.y <= EPS) box.minY = -b;
  if (area.x + area.w >= doc.trim.w - EPS) box.maxX = doc.trim.w + b;
  if (area.y + area.h >= doc.trim.h - EPS) box.maxY = doc.trim.h + b;
  return box;
}

const inside = (p: { x: number; y: number }, box: Box) =>
  p.x >= box.minX - EPS && p.x <= box.maxX + EPS && p.y >= box.minY - EPS && p.y <= box.maxY + EPS;

function insideEllipse(p: { x: number; y: number }, area: PrintArea) {
  const rx = area.w / 2;
  const ry = area.h / 2;
  const dx = (p.x - (area.x + rx)) / rx;
  const dy = (p.y - (area.y + ry)) / ry;
  return dx * dx + dy * dy <= 1 + EPS;
}

export function validateDocument(doc: DesignDocument, layout?: DesignLayout): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const areas = new Map(doc.printAreas.map((a) => [a.id, a]));
  const safe: Box = {
    minX: doc.safeMargin,
    minY: doc.safeMargin,
    maxX: doc.trim.w - doc.safeMargin,
    maxY: doc.trim.h - doc.safeMargin,
  };

  for (const el of doc.elements) {
    const area = areas.get(el.areaId);
    if (!area) {
      issues.push({
        elementId: el.id,
        code: "unknown-area",
        message: `Element is in unknown print area "${el.areaId}".`,
      });
      continue;
    }
    const corners = cornersOf(el);
    const box = allowedBox(area, doc);
    const outside =
      area.shape === "ellipse" && el.type === "text"
        ? corners.some((c) => !insideEllipse(c, area))
        : corners.some((c) => !inside(c, box));
    if (outside) {
      issues.push({
        elementId: el.id,
        code: "outside-area",
        message: "Part of this element is outside the printable area.",
      });
    } else if (el.type === "text" && corners.some((c) => !inside(c, safe))) {
      issues.push({
        elementId: el.id,
        code: "outside-safe-area",
        message: `Text must stay ${doc.safeMargin} mm inside the edge so it is not trimmed off.`,
      });
    }
  }

  for (const issue of layout?.issues ?? []) issues.push(issue);
  return issues;
}
