import { z } from "zod";

/**
 * DesignDocument v1: the single source of truth for artwork (docs/PLAN.md).
 *
 * Coordinates are millimetres from the top-left corner of the TRIM (the finished size); bleed
 * extends beyond it into negative / oversize coordinates. Rotation is degrees clockwise about
 * the element's centre. Font sizes are points. The browser canvas, the PDF writer and the PNG
 * renderer all draw from the layout computed from this document.
 */

const mm = z.number().finite();
const positiveMm = z.number().finite().positive();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #RRGGBB colour");
const id = z.string().min(1).max(64);

export const printAreaSchema = z.object({
  id,
  x: mm,
  y: mm,
  w: positiveMm,
  h: positiveMm,
  shape: z.enum(["rect", "ellipse"]).default("rect"),
  /** Shapes in this area may extend into the bleed where the area meets the trim edge. */
  allowBleed: z.boolean().default(false),
});

const baseElement = {
  id,
  areaId: id,
  x: mm,
  y: mm,
  w: positiveMm,
  h: positiveMm,
  rotation: z.number().finite().min(-360).max(360).default(0),
  locked: z.boolean().optional(),
};

export const textElementSchema = z.object({
  ...baseElement,
  type: z.literal("text"),
  text: z.string().max(500),
  /** Filled per order or per CSV row (PRD p4 §04, p6 §07). */
  placeholderKey: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,31}$/, "Placeholder keys are UPPER_CASE")
    .optional(),
  fontId: z.string().min(1).max(64),
  fontSize: z.number().positive().max(1000),
  minFontSize: z.number().positive().max(1000),
  maxFontSize: z.number().positive().max(1000),
  /** Letter spacing in thousandths of an em (CSS letter-spacing × 1000). */
  tracking: z.number().min(-200).max(1000).default(0),
  minTracking: z.number().min(-200).max(1000).default(0),
  fit: z.enum(["shrink", "none"]).default("shrink"),
  align: z.enum(["left", "center", "right"]).default("left"),
  color: hexColor,
});

export const imageElementSchema = z.object({
  ...baseElement,
  type: z.literal("image"),
  /** Uploaded asset; null for an empty slot in a template (e.g. "your logo here"). */
  assetId: z.string().uuid().nullable(),
  role: z.string().max(40).optional(),
});

export const rectElementSchema = z.object({
  ...baseElement,
  type: z.literal("rect"),
  fill: hexColor,
});

export const designElementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  imageElementSchema,
  rectElementSchema,
]);

export const designDocumentSchema = z
  .object({
    version: z.literal(1),
    unit: z.literal("mm"),
    trim: z.object({ w: positiveMm, h: positiveMm }),
    bleed: z.number().min(0).max(20),
    safeMargin: z.number().min(0).max(50),
    background: z.object({ color: hexColor }),
    printAreas: z.array(printAreaSchema).min(1).max(20),
    elements: z.array(designElementSchema).max(200),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    doc.elements.forEach((element, index) => {
      if (ids.has(element.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["elements", index, "id"],
          message: "Duplicate element id",
        });
      }
      ids.add(element.id);
      if (element.type === "text" && element.minFontSize > element.maxFontSize) {
        ctx.addIssue({
          code: "custom",
          path: ["elements", index, "minFontSize"],
          message: "Minimum font size is larger than the maximum",
        });
      }
    });
  });

export type PrintArea = z.infer<typeof printAreaSchema>;
export type TextElement = z.infer<typeof textElementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;
export type RectElement = z.infer<typeof rectElementSchema>;
export type DesignElement = z.infer<typeof designElementSchema>;
export type DesignDocument = z.infer<typeof designDocumentSchema>;

/** Values for placeholders, keyed by placeholderKey (from the order form or a CSV row). */
export type PlaceholderValues = Record<string, string>;
