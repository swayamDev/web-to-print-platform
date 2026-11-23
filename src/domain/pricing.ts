import Decimal from "decimal.js";
import { z } from "zod";

import type { CurrencyCode } from "./money";

/**
 * Parameter-driven pricing engine (PRD p5 §05, docs/PLAN.md "Pricing formula").
 *
 * Pure and deterministic: the browser runs it for an instant price, and the server runs
 * the same code on rules loaded from the database before any order is created. The server
 * result is the only one ever charged.
 *
 *   area_cm2     = width_mm × height_mm / 100
 *   unit_net     = base + area_cm2 × material_per_cm2 (area products only)
 *                  + material_per_unit + option add-ons + variable-data fee
 *   list_net     = unit_net × quantity                      (exact decimal)
 *   line_net     = list_net × (1 − tier%)                   (all-units tiers, DECISIONS D-06)
 *   subtotal_net = round(line_net) + setup_fee              (minor units)
 *   tax          = round(subtotal_net × tax_rate)
 *   total_gross  = subtotal_net + tax                       (what the customer sees and pays)
 *
 * Rounding is half-up, applied once per line and once for tax, never per unit (DECISIONS D-22).
 */

export const PRICING_ENGINE_VERSION = "pricing@1";

/** Exact decimal arithmetic for money; never use floating point for prices. */
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
type Dec = InstanceType<typeof D>;

const MINOR_PER_MAJOR = 100; // GBP pence and INR paise

// -----------------------------------------------------------------------------
// Rules (loaded from the database) and requests (from the configurator)
// -----------------------------------------------------------------------------

export type Orientation = "portrait" | "landscape";

export type OptionValueRule = {
  value: string;
  label: string;
  pricePerUnit: string; // decimal string
  isDefault?: boolean;
};

export type OptionRule = { key: string; label: string; values: OptionValueRule[] };

export type MaterialRule = {
  slug: string;
  name: string;
  pricePerCm2: string; // decimal string
  pricePerUnit: string; // decimal string
  isDefault: boolean;
};

export type DiscountTierRule = { minQty: number; percentOff: string };

export type PricingRules = {
  product: {
    slug: string;
    name: string;
    pricingModel: "area" | "unit";
    baseUnitPrice: string;
    setupFeeMinor: number;
    variableDataUnitFee: string;
    minWidthMm: number;
    maxWidthMm: number;
    minHeightMm: number;
    maxHeightMm: number;
    orientations: Orientation[];
    minQty: number;
    maxQty: number;
    qtyStep: number;
    supportsVariableData: boolean;
  };
  materials: MaterialRule[];
  options: OptionRule[];
  /** Product-specific tiers if the product has any, otherwise the global tiers. */
  tiers: DiscountTierRule[];
  settings: { currency: CurrencyCode; taxRate: string; taxLabel: string };
};

export const priceRequestSchema = z.object({
  productSlug: z.string().trim().min(1).max(80),
  widthMm: z.number().finite().positive().max(10_000),
  heightMm: z.number().finite().positive().max(10_000),
  materialSlug: z.string().trim().min(1).max(80),
  quantity: z.number().int().positive().max(1_000_000),
  options: z.record(z.string().max(40), z.string().max(40)).default({}),
  variableData: z.boolean().default(false),
});

export type PriceRequest = z.infer<typeof priceRequestSchema>;

// -----------------------------------------------------------------------------
// Results
// -----------------------------------------------------------------------------

export type PriceError = {
  field: "widthMm" | "heightMm" | "materialSlug" | "quantity" | "options" | "variableData";
  message: string;
};

export type PriceQuote = {
  engine: typeof PRICING_ENGINE_VERSION;
  currency: CurrencyCode;
  taxLabel: string;
  taxRate: string;
  orientation: Orientation;
  areaCm2: string;
  quantity: number;
  /** Per-unit net components, exact decimals as strings (for the breakdown). */
  unit: {
    base: string;
    material: string;
    options: string;
    variableData: string;
    net: string;
  };
  /** Selected option values after applying defaults. */
  selectedOptions: Record<string, string>;
  /** Volume discount applied to the whole quantity, or null below the first tier. */
  tier: { minQty: number; percentOff: string } | null;
  /** All money below is in minor units (pence/paise). */
  listNetMinor: number;
  discountMinor: number;
  lineNetMinor: number;
  setupFeeMinor: number;
  subtotalNetMinor: number;
  taxMinor: number;
  totalGrossMinor: number;
  /** Total including tax divided by quantity, for "≈ £0.16 each" display only. */
  unitGrossDisplay: string;
  /** The next discount tier above this quantity, priced, for "order more and save" hints. */
  nextTier: { minQty: number; percentOff: string; totalGrossMinor: number } | null;
};

export type PriceResult = { ok: true; quote: PriceQuote } | { ok: false; errors: PriceError[] };

// -----------------------------------------------------------------------------
// Engine
// -----------------------------------------------------------------------------

const toMinor = (major: Dec): number =>
  major.times(MINOR_PER_MAJOR).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

const fmtMm = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));

/** A square counts as portrait. Orientation is derived from the size, never trusted as input. */
export function orientationOf(widthMm: number, heightMm: number): Orientation {
  return widthMm > heightMm ? "landscape" : "portrait";
}

/** The tier that applies to a quantity: the highest minimum the quantity reaches. */
export function tierFor(tiers: DiscountTierRule[], quantity: number): DiscountTierRule | null {
  let best: DiscountTierRule | null = null;
  for (const tier of tiers) {
    if (quantity >= tier.minQty && (!best || tier.minQty > best.minQty)) best = tier;
  }
  return best;
}

export function validatePriceRequest(rules: PricingRules, req: PriceRequest): PriceError[] {
  const p = rules.product;
  const errors: PriceError[] = [];

  if (req.widthMm < p.minWidthMm || req.widthMm > p.maxWidthMm) {
    errors.push({
      field: "widthMm",
      message: `Width must be between ${fmtMm(p.minWidthMm)} and ${fmtMm(p.maxWidthMm)} mm.`,
    });
  }
  if (req.heightMm < p.minHeightMm || req.heightMm > p.maxHeightMm) {
    errors.push({
      field: "heightMm",
      message: `Height must be between ${fmtMm(p.minHeightMm)} and ${fmtMm(p.maxHeightMm)} mm.`,
    });
  }
  const orientation = orientationOf(req.widthMm, req.heightMm);
  if (!errors.length && !p.orientations.includes(orientation)) {
    errors.push({
      field: "widthMm",
      message: `This product is only made in ${p.orientations.join(" or ")} orientation.`,
    });
  }

  if (req.quantity < p.minQty) {
    errors.push({ field: "quantity", message: `The minimum order is ${p.minQty}.` });
  } else if (req.quantity > p.maxQty) {
    errors.push({
      field: "quantity",
      message: `The maximum online order is ${p.maxQty.toLocaleString("en-GB")}.`,
    });
  } else if ((req.quantity - p.minQty) % p.qtyStep !== 0) {
    errors.push({ field: "quantity", message: `Quantity must go up in steps of ${p.qtyStep}.` });
  }

  if (!rules.materials.some((m) => m.slug === req.materialSlug)) {
    errors.push({ field: "materialSlug", message: "Choose one of the materials offered." });
  }

  for (const [key, value] of Object.entries(req.options)) {
    const option = rules.options.find((o) => o.key === key);
    if (!option || !option.values.some((v) => v.value === value)) {
      errors.push({ field: "options", message: `"${value}" is not a valid choice for ${key}.` });
    }
  }

  if (req.variableData && !p.supportsVariableData) {
    errors.push({
      field: "variableData",
      message: "This product cannot be personalised from a CSV.",
    });
  }

  return errors;
}

/** Fill in each option's default (or first) value when the request leaves it out. */
function resolveOptions(rules: PricingRules, chosen: Record<string, string>) {
  const selected: Record<string, string> = {};
  let perUnit = new D(0);
  for (const option of rules.options) {
    const value =
      option.values.find((v) => v.value === chosen[option.key]) ??
      option.values.find((v) => v.isDefault) ??
      option.values[0];
    if (!value) continue;
    selected[option.key] = value.value;
    perUnit = perUnit.plus(value.pricePerUnit);
  }
  return { selected, perUnit };
}

type Totals = Pick<
  PriceQuote,
  | "listNetMinor"
  | "discountMinor"
  | "lineNetMinor"
  | "setupFeeMinor"
  | "subtotalNetMinor"
  | "taxMinor"
  | "totalGrossMinor"
> & { tier: DiscountTierRule | null };

function totalsFor(rules: PricingRules, unitNet: Dec, quantity: number): Totals {
  const tier = tierFor(rules.tiers, quantity);
  const listNet = unitNet.times(quantity);
  const lineNet = tier ? listNet.times(new D(100).minus(tier.percentOff)).div(100) : listNet;

  const listNetMinor = toMinor(listNet);
  const lineNetMinor = toMinor(lineNet);
  const setupFeeMinor = rules.product.setupFeeMinor;
  const subtotalNetMinor = lineNetMinor + setupFeeMinor;
  const taxMinor = new D(subtotalNetMinor)
    .times(rules.settings.taxRate)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();

  return {
    tier,
    listNetMinor,
    // Shown as "volume discount": the difference between the two rounded figures, so the
    // breakdown always adds up exactly on screen and on the invoice.
    discountMinor: listNetMinor - lineNetMinor,
    lineNetMinor,
    setupFeeMinor,
    subtotalNetMinor,
    taxMinor,
    totalGrossMinor: subtotalNetMinor + taxMinor,
  };
}

/** Price a configured product. Returns field errors instead of throwing for bad input. */
export function calculatePrice(rules: PricingRules, req: PriceRequest): PriceResult {
  const errors = validatePriceRequest(rules, req);
  if (errors.length) return { ok: false, errors };

  const p = rules.product;
  // validatePriceRequest guarantees the material exists.
  const material = rules.materials.find((m) => m.slug === req.materialSlug)!;
  const areaCm2 = new D(req.widthMm).times(req.heightMm).div(100);

  const base = new D(p.baseUnitPrice);
  const materialPart = (
    p.pricingModel === "area" ? areaCm2.times(material.pricePerCm2) : new D(0)
  ).plus(material.pricePerUnit);
  const { selected, perUnit: optionsPart } = resolveOptions(rules, req.options);
  const variableDataPart = req.variableData ? new D(p.variableDataUnitFee) : new D(0);
  const unitNet = base.plus(materialPart).plus(optionsPart).plus(variableDataPart);

  const { tier, ...totals } = totalsFor(rules, unitNet, req.quantity);

  const higher = rules.tiers
    .filter((t) => t.minQty > req.quantity && t.minQty <= p.maxQty)
    .sort((a, b) => a.minQty - b.minQty)[0];
  const nextTier = higher
    ? {
        minQty: higher.minQty,
        percentOff: new D(higher.percentOff).toString(),
        totalGrossMinor: totalsFor(rules, unitNet, higher.minQty).totalGrossMinor,
      }
    : null;

  return {
    ok: true,
    quote: {
      engine: PRICING_ENGINE_VERSION,
      currency: rules.settings.currency,
      taxLabel: rules.settings.taxLabel,
      taxRate: new D(rules.settings.taxRate).toString(),
      orientation: orientationOf(req.widthMm, req.heightMm),
      areaCm2: areaCm2.toString(),
      quantity: req.quantity,
      unit: {
        base: base.toString(),
        material: materialPart.toString(),
        options: optionsPart.toString(),
        variableData: variableDataPart.toString(),
        net: unitNet.toString(),
      },
      selectedOptions: selected,
      tier: tier ? { minQty: tier.minQty, percentOff: new D(tier.percentOff).toString() } : null,
      ...totals,
      unitGrossDisplay: new D(totals.totalGrossMinor)
        .div(MINOR_PER_MAJOR)
        .div(req.quantity)
        .toDecimalPlaces(4)
        .toString(),
      nextTier,
    },
  };
}
