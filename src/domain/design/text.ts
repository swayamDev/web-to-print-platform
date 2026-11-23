import { ptToMm } from "./units";

/**
 * Font measurement and per-placeholder text fitting (PRD p4 §04, p6 §07).
 *
 * Shaping model (DECISIONS D-26): one glyph per character, advance widths plus tracking, no
 * kerning and no ligatures. Every renderer (canvas, PDF, PNG) places glyphs the same way, so a
 * fitted line has the same width everywhere.
 */

export type FontMetrics = {
  unitsPerEm: number;
  /** Positive, in font units. */
  ascender: number;
  /** Negative, in font units. */
  descender: number;
  /** Advance width of one character in font units, or null if the font has no glyph for it. */
  advanceOf(char: string): number | null;
};

export type MeasuredLine = {
  widthMm: number;
  /** Height of the font's line box (ascender to descender) in mm. */
  heightMm: number;
  missingChars: string[];
};

/** Width of a single line: Σ advances + tracking between characters (not after the last). */
export function measureLine(
  text: string,
  sizePt: number,
  trackingPerMille: number,
  metrics: FontMetrics,
): MeasuredLine {
  const chars = Array.from(text);
  let units = 0;
  const missing = new Set<string>();
  for (const char of chars) {
    const advance = metrics.advanceOf(char);
    if (advance === null) missing.add(char);
    else units += advance;
  }
  const scale = sizePt / metrics.unitsPerEm;
  const trackingPt = (trackingPerMille / 1000) * sizePt * Math.max(chars.length - 1, 0);
  return {
    widthMm: ptToMm(units * scale + trackingPt),
    heightMm: ptToMm((metrics.ascender - metrics.descender) * scale),
    missingChars: [...missing],
  };
}

export type FitRules = {
  maxFontSize: number;
  minFontSize: number;
  tracking: number;
  minTracking: number;
  fit: "shrink" | "none";
};

export type FitResult = {
  fontSizePt: number;
  trackingPerMille: number;
  widthMm: number;
  heightMm: number;
  fits: boolean;
  /** True when the text needed a smaller size or tighter tracking than the maximum. */
  adjusted: boolean;
  missingChars: string[];
};

const SIZE_STEP_PT = 0.5;
const TRACKING_STEP = 5;

/**
 * Fit one line of text into a box. For each font size from max down to min (0.5 pt steps),
 * tighten tracking from the template value down to its minimum (5/1000 em steps); the first
 * combination whose width and line height fit wins. Larger type with tighter tracking is
 * preferred over smaller type. If nothing fits at the minimum size and tracking, the result
 * says so (fits: false) instead of shrinking further: the caller must block printing.
 */
export function fitText(
  text: string,
  boxWmm: number,
  boxHmm: number,
  rules: FitRules,
  metrics: FontMetrics,
): FitResult {
  const tryFit = (size: number, tracking: number) => {
    const line = measureLine(text, size, tracking, metrics);
    return { line, ok: line.widthMm <= boxWmm + 1e-6 && line.heightMm <= boxHmm + 1e-6 };
  };

  if (rules.fit === "none") {
    const { line, ok } = tryFit(rules.maxFontSize, rules.tracking);
    return {
      fontSizePt: rules.maxFontSize,
      trackingPerMille: rules.tracking,
      widthMm: line.widthMm,
      heightMm: line.heightMm,
      fits: ok,
      adjusted: false,
      missingChars: line.missingChars,
    };
  }

  const minTracking = Math.min(rules.minTracking, rules.tracking);
  for (let size = rules.maxFontSize; size >= rules.minFontSize - 1e-9; size -= SIZE_STEP_PT) {
    for (let tracking = rules.tracking; tracking >= minTracking - 1e-9; tracking -= TRACKING_STEP) {
      const { line, ok } = tryFit(size, tracking);
      if (ok) {
        return {
          fontSizePt: round2(size),
          trackingPerMille: round2(tracking),
          widthMm: line.widthMm,
          heightMm: line.heightMm,
          fits: true,
          adjusted: size !== rules.maxFontSize || tracking !== rules.tracking,
          missingChars: line.missingChars,
        };
      }
    }
  }

  const { line } = tryFit(rules.minFontSize, minTracking);
  return {
    fontSizePt: rules.minFontSize,
    trackingPerMille: minTracking,
    widthMm: line.widthMm,
    heightMm: line.heightMm,
    fits: false,
    adjusted: true,
    missingChars: line.missingChars,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
