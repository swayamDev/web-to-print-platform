import Decimal from "decimal.js";
import { z } from "zod";

/**
 * Admin product editing (PRD p9 §14: products, sizes, materials and prices are managed in the
 * admin, not in code). Pure validation of the edit form; the database applies it atomically.
 * Rates stay exact decimal strings; money totals are integer minor units.
 */

/** A non-negative decimal written with at most `places` decimals, e.g. "0.1500". */
const decimalString = (places: number, label: string) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{1,8}(\\.\\d{1,${places}})?$`),
      `${label}: enter a number with up to ${places} decimals`,
    );

const mm = (label: string) =>
  z.coerce
    .number({ error: `${label}: enter a size in millimetres` })
    .positive(`${label} must be more than 0 mm`)
    .max(5000, `${label} is too large`)
    .refine((v) => Number.isInteger(v * 100), `${label}: at most 2 decimals`);

const whole = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `${label}: enter a whole number` })
    .int(`${label}: enter a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

export const materialEditSchema = z.object({
  materialId: z.string().uuid(),
  offered: z.boolean(),
  isDefault: z.boolean(),
  pricePerCm2: decimalString(6, "Price per cm²"),
  pricePerUnit: decimalString(4, "Price per item"),
});

export const tierEditSchema = z.object({
  minQty: whole("Tier quantity", 2, 1_000_000),
  percentOff: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d{1,2})?$/, "Discount: enter a percentage such as 10 or 12.5")
    .refine((v) => Number(v) > 0 && Number(v) < 100, "Discount must be between 0 and 100%"),
});

export const productEditSchema = z
  .object({
    productId: z.string().uuid(),
    name: z.string().trim().min(2, "Name is too short").max(120),
    shortDescription: z.string().trim().max(300),
    isActive: z.boolean(),
    baseUnitPrice: decimalString(4, "Base price per item"),
    /** In major units as typed, e.g. "5.00"; stored as minor units. */
    setupFee: decimalString(2, "Setup fee"),
    variableDataUnitFee: decimalString(4, "Personalisation fee per item"),
    minWidthMm: mm("Minimum width"),
    maxWidthMm: mm("Maximum width"),
    minHeightMm: mm("Minimum height"),
    maxHeightMm: mm("Maximum height"),
    defaultWidthMm: mm("Default width"),
    defaultHeightMm: mm("Default height"),
    minQty: whole("Minimum quantity", 1, 1_000_000),
    maxQty: whole("Maximum quantity", 1, 1_000_000),
    qtyStep: whole("Quantity step", 1, 100_000),
    bleedMm: z.coerce.number().min(0).max(20),
    safeMarginMm: z.coerce.number().min(0).max(50),
    outputDpi: whole("Output DPI", 72, 1200),
    materials: z.array(materialEditSchema).min(1).max(50),
    /** Empty = this product uses the global default tiers. */
    tiers: z.array(tierEditSchema).max(20),
  })
  .superRefine((p, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (p.maxWidthMm < p.minWidthMm) issue("maxWidthMm", "Maximum width is below the minimum");
    if (p.maxHeightMm < p.minHeightMm) issue("maxHeightMm", "Maximum height is below the minimum");
    if (p.defaultWidthMm < p.minWidthMm || p.defaultWidthMm > p.maxWidthMm)
      issue("defaultWidthMm", "Default width must be within the size limits");
    if (p.defaultHeightMm < p.minHeightMm || p.defaultHeightMm > p.maxHeightMm)
      issue("defaultHeightMm", "Default height must be within the size limits");
    if (p.maxQty < p.minQty) issue("maxQty", "Maximum quantity is below the minimum");

    const offered = p.materials.filter((m) => m.offered);
    if (offered.length === 0) issue("materials", "Offer at least one material");
    if (offered.filter((m) => m.isDefault).length !== 1)
      issue("materials", "Choose exactly one default material among those offered");
    if (p.materials.some((m) => m.isDefault && !m.offered))
      issue("materials", "The default material must be offered");

    const sorted = [...p.tiers].sort((a, b) => a.minQty - b.minQty);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.minQty === sorted[i - 1]!.minQty)
        issue("tiers", `Two discount tiers start at ${sorted[i]!.minQty}`);
      else if (Number(sorted[i]!.percentOff) <= Number(sorted[i - 1]!.percentOff))
        issue("tiers", "Larger quantities must get a larger discount");
    }
  });

export type ProductEditInput = z.input<typeof productEditSchema>;
export type ProductEdit = z.output<typeof productEditSchema>;

/** "5" / "5.5" / "5.50" → 500 / 550 / 550 minor units, exactly. */
export function toMinorUnits(major: string): number {
  return new Decimal(major).times(100).toDecimalPlaces(0).toNumber();
}

/** 1250 → "12.50", for the edit form. */
export function fromMinorUnits(minor: number): string {
  return new Decimal(minor).dividedBy(100).toFixed(2);
}

/** Normalise a decimal string for comparison and storage: "0.150" → "0.15". */
export function normaliseDecimal(value: string): string {
  return new Decimal(value).toString();
}

/** Database row shape written by admin_update_product. */
export function toProductPatch(p: ProductEdit) {
  return {
    name: p.name,
    short_description: p.shortDescription || null,
    is_active: p.isActive,
    base_unit_price: normaliseDecimal(p.baseUnitPrice),
    setup_fee_minor: toMinorUnits(p.setupFee),
    variable_data_unit_fee: normaliseDecimal(p.variableDataUnitFee),
    min_width_mm: p.minWidthMm,
    max_width_mm: p.maxWidthMm,
    min_height_mm: p.minHeightMm,
    max_height_mm: p.maxHeightMm,
    default_width_mm: p.defaultWidthMm,
    default_height_mm: p.defaultHeightMm,
    min_qty: p.minQty,
    max_qty: p.maxQty,
    qty_step: p.qtyStep,
    bleed_mm: p.bleedMm,
    safe_margin_mm: p.safeMarginMm,
    output_dpi: p.outputDpi,
  };
}

/** Which fields differ (for the audit log), comparing decimals by value. */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const same = (a: unknown, b: unknown) => {
    if (a === b) return true;
    const numeric = (v: unknown) =>
      typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v));
    if (numeric(a) && numeric(b)) return new Decimal(String(a)).equals(new Decimal(String(b)));
    return JSON.stringify(a) === JSON.stringify(b);
  };
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(after)) {
    if (!same(before[key], value)) diff[key] = { from: before[key] ?? null, to: value };
  }
  return diff;
}
