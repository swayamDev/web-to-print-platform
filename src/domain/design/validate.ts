import { DPI_MINIMUM, DPI_WARNING, effectiveDpiOf, type AssetInfo } from "../uploads";

import type { DesignLayout, LayoutIssue } from "./layout";
import { rotatePoint } from "./layout";
import type { DesignDocument, DesignElement, PrintArea } from "./schema";

/**
 * Print checks (PRD p5 §06: "unprintable artwork cannot be created").
 *
 * The designer prevents most of these interactively; this check runs on the server on every
 * save, proof and checkout, so a hand-edited or tampered document is caught too.
 *
 *  - every element must sit inside its print area (rotation included);
 *  - areas marked allowBleed let shapes run into the bleed where the area meets the trim edge;
 *  - text must also stay inside the safe area (trim inset by the safe margin);
 *  - text must fit its box and use characters the font can print (from the layout);
 *  - uploaded images must exist, and rasters need enough resolution at their printed size
 *    (below 150 DPI is a warning, below 72 DPI blocks printing: DECISIONS D-14).
 *
 * Errors block proofs and production; warnings are shown but do not block.
 */

export type DesignIssue = {
  elementId: string;
  code:
    | "unknown-area"
    | "outside-area"
    | "outside-safe-area"
    | "missing-asset"
    | "low-resolution"
    | LayoutIssue["code"];
  severity: "error" | "warning";
  message: string;
};

export const blockingIssues = (issues: DesignIssue[]) =>
  issues.filter((i) => i.severity === "error");

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

/**
 * @param assets Uploaded files the design may use. When given, image elements must reference
 *   one of them and rasters are checked for resolution; when omitted, images are not checked.
 */
export function validateDocument(
  doc: DesignDocument,
  layout?: DesignLayout,
  assets?: ReadonlyMap<string, AssetInfo>,
): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const areas = new Map(doc.printAreas.map((a) => [a.id, a]));
  const safe: Box = {
    minX: doc.safeMargin,
    minY: doc.safeMargin,
    maxX: doc.trim.w - doc.safeMargin,
    maxY: doc.trim.h - doc.safeMargin,
  };
  const error = (el: DesignElement, code: DesignIssue["code"], message: string) =>
    issues.push({ elementId: el.id, code, severity: "error", message });

  for (const el of doc.elements) {
    const area = areas.get(el.areaId);
    if (!area) {
      error(el, "unknown-area", `Element is in unknown print area "${el.areaId}".`);
      continue;
    }
    const corners = cornersOf(el);
    const box = allowedBox(area, doc);
    const outside =
      area.shape === "ellipse" && el.type === "text"
        ? corners.some((c) => !insideEllipse(c, area))
        : corners.some((c) => !inside(c, box));
    if (outside) {
      error(el, "outside-area", "Part of this element is outside the printable area.");
    } else if (el.type === "text" && corners.some((c) => !inside(c, safe))) {
      error(
        el,
        "outside-safe-area",
        `Text must stay ${doc.safeMargin} mm inside the edge so it is not trimmed off.`,
      );
    }

    if (el.type === "image" && el.assetId && assets) {
      const asset = assets.get(el.assetId);
      if (!asset) {
        error(el, "missing-asset", "This image is no longer available. Upload it again.");
        continue;
      }
      const dpi = effectiveDpiOf(asset, el.w, el.h);
      if (dpi !== null && dpi < DPI_MINIMUM) {
        error(
          el,
          "low-resolution",
          `This image is only ${dpi} DPI at this size and would print blurry. Make it smaller or upload a larger image (${DPI_WARNING} DPI or more).`,
        );
      } else if (dpi !== null && dpi < DPI_WARNING) {
        issues.push({
          elementId: el.id,
          code: "low-resolution",
          severity: "warning",
          message: `This image is ${dpi} DPI at this size; ${DPI_WARNING} DPI or more is recommended for sharp print.`,
        });
      }
    }
  }

  for (const issue of layout?.issues ?? []) issues.push({ ...issue, severity: "error" });
  return issues;
}
