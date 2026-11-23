import opentype from "opentype.js";

import type { FontMetrics } from "@/domain/design/text";
import { ptToMm } from "@/domain/design/units";

/**
 * Print fonts. The same TTF files (src/assets/fonts, built by scripts/build-fonts.mts) are used
 * for measuring, for the PDF and for the PNG, so text fits identically everywhere.
 */
export const FONT_IDS = ["sora-bold", "inter-semibold", "inter-regular"] as const;
export type FontId = (typeof FONT_IDS)[number];

export const FONT_LABELS: Record<FontId, string> = {
  "sora-bold": "Sora Bold",
  "inter-semibold": "Inter SemiBold",
  "inter-regular": "Inter Regular",
};

export const isFontId = (id: string): id is FontId => (FONT_IDS as readonly string[]).includes(id);

export type LoadedFont = {
  id: string;
  bytes: Uint8Array;
  font: opentype.Font;
  metrics: FontMetrics;
};

export function loadFont(id: string, bytes: Uint8Array): LoadedFont {
  // opentype.js needs an ArrayBuffer holding exactly this file.
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const font = opentype.parse(buffer);
  const metrics: FontMetrics = {
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    advanceOf(char) {
      // charToGlyphIndex returns 0 (.notdef) when the font has no glyph for the character.
      if (font.charToGlyphIndex(char) === 0) return null;
      return font.charToGlyph(char).advanceWidth ?? 0;
    },
  };
  return { id, bytes, font, metrics };
}

/**
 * Glyph placement shared by every renderer (DECISIONS D-26): one glyph per character, advance
 * widths plus tracking, no kerning or ligatures. Returns x offsets in mm from the line start.
 */
export function placeGlyphs(
  loaded: LoadedFont,
  text: string,
  sizePt: number,
  trackingPerMille: number,
) {
  const scale = sizePt / loaded.font.unitsPerEm;
  const trackingPt = (trackingPerMille / 1000) * sizePt;
  const placed: { char: string; glyph: opentype.Glyph; xMm: number }[] = [];
  let xPt = 0;
  for (const char of Array.from(text)) {
    const glyph = loaded.font.charToGlyph(char);
    placed.push({ char, glyph, xMm: ptToMm(xPt) });
    xPt += (glyph.advanceWidth ?? 0) * scale + trackingPt;
  }
  return placed;
}

/** SVG path data (in mm) for a line of text with its baseline starting at (xMm, yMm). */
export function textToPathData(
  loaded: LoadedFont,
  text: string,
  xMm: number,
  yMm: number,
  sizePt: number,
  trackingPerMille: number,
): string {
  const sizeMm = ptToMm(sizePt);
  return placeGlyphs(loaded, text, sizePt, trackingPerMille)
    .map(({ glyph, xMm: dx }) => glyph.getPath(xMm + dx, yMm, sizeMm).toPathData(3))
    .filter(Boolean)
    .join("");
}
