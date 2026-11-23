import type { DesignDocument, PlaceholderValues } from "./schema";
import { fitText, type FontMetrics } from "./text";

/**
 * Turn a DesignDocument into absolute page geometry that every renderer draws identically.
 *
 * Page coordinates: millimetres from the top-left corner of the BLEED box (the full output
 * page), y pointing down. page = trim + 2 × bleed on each axis.
 */

export type LaidOutRect = {
  kind: "rect";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  fill: string;
};

export type LaidOutImage = {
  kind: "image";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  assetId: string | null;
};

export type LaidOutText = {
  kind: "text";
  id: string;
  text: string;
  fontId: string;
  fontSizePt: number;
  trackingPerMille: number;
  color: string;
  /** Start of the baseline before rotation (page mm). */
  originX: number;
  originY: number;
  /** Rotation in degrees clockwise about (centerX, centerY). */
  rotation: number;
  centerX: number;
  centerY: number;
  widthMm: number;
  /** The element's box in page mm, for guides and validation. */
  box: { x: number; y: number; w: number; h: number };
  fits: boolean;
  adjusted: boolean;
  missingChars: string[];
};

export type LaidOutItem = LaidOutRect | LaidOutImage | LaidOutText;

export type LayoutIssue = {
  elementId: string;
  code: "overflow" | "missing-glyphs" | "unknown-font";
  message: string;
};

export type DesignLayout = {
  pageWidthMm: number;
  pageHeightMm: number;
  bleedMm: number;
  trim: { x: number; y: number; w: number; h: number };
  background: string;
  items: LaidOutItem[];
  issues: LayoutIssue[];
};

export type FontLookup = (fontId: string) => FontMetrics | undefined;

/** Text for an element: the placeholder's value if one is supplied, else the template text. */
export function resolveText(
  text: string,
  placeholderKey: string | undefined,
  values: PlaceholderValues,
) {
  if (placeholderKey && Object.prototype.hasOwnProperty.call(values, placeholderKey)) {
    return values[placeholderKey]!;
  }
  return text;
}

export function layoutDocument(
  doc: DesignDocument,
  values: PlaceholderValues,
  fonts: FontLookup,
): DesignLayout {
  const b = doc.bleed;
  const items: LaidOutItem[] = [];
  const issues: LayoutIssue[] = [];

  for (const el of doc.elements) {
    const x = el.x + b;
    const y = el.y + b;
    const rotation = el.rotation ?? 0;

    if (el.type === "rect") {
      items.push({ kind: "rect", id: el.id, x, y, w: el.w, h: el.h, rotation, fill: el.fill });
      continue;
    }
    if (el.type === "image") {
      items.push({
        kind: "image",
        id: el.id,
        x,
        y,
        w: el.w,
        h: el.h,
        rotation,
        assetId: el.assetId,
      });
      continue;
    }

    const metrics = fonts(el.fontId);
    if (!metrics) {
      issues.push({
        elementId: el.id,
        code: "unknown-font",
        message: `Font "${el.fontId}" is not available.`,
      });
      continue;
    }
    const text = resolveText(el.text, el.placeholderKey, values);
    const fit = fitText(
      text,
      el.w,
      el.h,
      {
        maxFontSize: el.maxFontSize,
        minFontSize: el.minFontSize,
        tracking: el.tracking ?? 0,
        minTracking: el.minTracking ?? 0,
        fit: el.fit ?? "shrink",
      },
      metrics,
    );

    const scale = fit.fontSizePt / metrics.unitsPerEm;
    const ascMm = (metrics.ascender * scale * 25.4) / 72;
    // Centre the font's line box vertically in the element box.
    const originY = y + (el.h - fit.heightMm) / 2 + ascMm;
    const align = el.align ?? "left";
    const originX =
      align === "center"
        ? x + (el.w - fit.widthMm) / 2
        : align === "right"
          ? x + el.w - fit.widthMm
          : x;

    if (!fit.fits) {
      issues.push({
        elementId: el.id,
        code: "overflow",
        message: `"${text}" does not fit, even at ${el.minFontSize} pt with the tightest spacing.`,
      });
    }
    if (fit.missingChars.length > 0) {
      issues.push({
        elementId: el.id,
        code: "missing-glyphs",
        message: `The font cannot print: ${fit.missingChars.join(" ")}`,
      });
    }

    items.push({
      kind: "text",
      id: el.id,
      text,
      fontId: el.fontId,
      fontSizePt: fit.fontSizePt,
      trackingPerMille: fit.trackingPerMille,
      color: el.color,
      originX,
      originY,
      rotation,
      centerX: x + el.w / 2,
      centerY: y + el.h / 2,
      widthMm: fit.widthMm,
      box: { x, y, w: el.w, h: el.h },
      fits: fit.fits,
      adjusted: fit.adjusted,
      missingChars: fit.missingChars,
    });
  }

  return {
    pageWidthMm: doc.trim.w + 2 * b,
    pageHeightMm: doc.trim.h + 2 * b,
    bleedMm: b,
    trim: { x: b, y: b, w: doc.trim.w, h: doc.trim.h },
    background: doc.background.color,
    items,
    issues,
  };
}

/** Rotate point (px, py) clockwise by `degrees` about (cx, cy), in y-down coordinates. */
export function rotatePoint(px: number, py: number, cx: number, cy: number, degrees: number) {
  const r = (degrees * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * Math.cos(r) - dy * Math.sin(r),
    y: cy + dx * Math.sin(r) + dy * Math.cos(r),
  };
}
