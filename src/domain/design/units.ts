/**
 * Physical units. Designs are stored in millimetres; fonts are sized in points; PDF pages are
 * measured in points (1/72 inch); PNG output is pixels at a given DPI.
 */
export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;
export const MM_PER_PT = MM_PER_INCH / PT_PER_INCH; // 0.3527…

export const ptToMm = (pt: number) => pt * MM_PER_PT;
export const mmToPt = (mm: number) => mm / MM_PER_PT;

/** Whole pixels for a physical length at a resolution: 54 mm at 300 DPI -> 638 px. */
export const mmToPx = (mm: number, dpi: number) => Math.round((mm / MM_PER_INCH) * dpi);

/** Effective resolution of an image placed at a physical width (DECISIONS D-14). */
export const effectiveDpi = (pixels: number, placedMm: number) =>
  placedMm > 0 ? (pixels / placedMm) * MM_PER_INCH : 0;
