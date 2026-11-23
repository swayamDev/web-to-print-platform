import { describe, expect, it } from "vitest";

import {
  calculatePrice,
  orientationOf,
  priceRequestSchema,
  tierFor,
  type PriceQuote,
  type PriceRequest,
  type PricingRules,
} from "./pricing";

/**
 * Rules mirror supabase/seed.sql (sample rates, GBP, 20% VAT, global tiers 100/250/500).
 * Expected totals are worked out by hand in the comments so the arithmetic can be audited.
 */

const GLOBAL_TIERS = [
  { minQty: 100, percentOff: "10" },
  { minQty: 250, percentOff: "15" },
  { minQty: 500, percentOff: "20" },
];
const GBP = { currency: "GBP" as const, taxRate: "0.2", taxLabel: "VAT" };

const stickers: PricingRules = {
  product: {
    slug: "custom-stickers",
    name: "Custom Stickers",
    pricingModel: "area",
    baseUnitPrice: "0.05",
    setupFeeMinor: 0,
    variableDataUnitFee: "0",
    minWidthMm: 20,
    maxWidthMm: 300,
    minHeightMm: 20,
    maxHeightMm: 300,
    orientations: ["portrait", "landscape"],
    minQty: 25,
    maxQty: 10000,
    qtyStep: 1,
    supportsVariableData: false,
  },
  materials: [
    {
      slug: "gloss-vinyl",
      name: "Gloss vinyl",
      pricePerCm2: "0.004",
      pricePerUnit: "0",
      isDefault: true,
    },
    {
      slug: "clear-vinyl",
      name: "Clear vinyl",
      pricePerCm2: "0.005",
      pricePerUnit: "0",
      isDefault: false,
    },
  ],
  options: [],
  tiers: GLOBAL_TIERS,
  settings: GBP,
};

const raceNumbers: PricingRules = {
  product: {
    ...stickers.product,
    slug: "race-numbers",
    name: "Race Numbers",
    baseUnitPrice: "0.20",
    variableDataUnitFee: "0.05",
    minWidthMm: 100,
    maxWidthMm: 297,
    minHeightMm: 80,
    maxHeightMm: 210,
    minQty: 10,
    maxQty: 5000,
    supportsVariableData: true,
  },
  materials: [
    { slug: "tyvek", name: "Tyvek", pricePerCm2: "0.0015", pricePerUnit: "0", isDefault: true },
  ],
  options: [],
  tiers: GLOBAL_TIERS,
  settings: GBP,
};

const stamps: PricingRules = {
  product: {
    ...stickers.product,
    slug: "custom-stamps",
    name: "Custom Stamps",
    pricingModel: "unit",
    baseUnitPrice: "8",
    minWidthMm: 20,
    maxWidthMm: 80,
    minHeightMm: 10,
    maxHeightMm: 60,
    minQty: 1,
    maxQty: 500,
  },
  materials: [
    {
      slug: "self-inking",
      name: "Self-inking",
      pricePerCm2: "0",
      pricePerUnit: "6",
      isDefault: true,
    },
    {
      slug: "wood-mount",
      name: "Wooden handle",
      pricePerCm2: "0",
      pricePerUnit: "2",
      isDefault: false,
    },
  ],
  options: [
    {
      key: "ink",
      label: "Ink colour",
      values: [
        { value: "black", label: "Black", pricePerUnit: "0", isDefault: true },
        { value: "red", label: "Red", pricePerUnit: "0" },
      ],
    },
  ],
  tiers: GLOBAL_TIERS,
  settings: GBP,
};

const laserSigns: PricingRules = {
  product: {
    ...stickers.product,
    slug: "laser-cut-signs",
    name: "Laser-Cut Signs",
    baseUnitPrice: "2",
    setupFeeMinor: 500,
    minWidthMm: 50,
    maxWidthMm: 600,
    minHeightMm: 50,
    maxHeightMm: 600,
    minQty: 1,
    maxQty: 500,
  },
  materials: [
    {
      slug: "acrylic-clear-3",
      name: "Clear acrylic",
      pricePerCm2: "0.012",
      pricePerUnit: "0",
      isDefault: true,
    },
  ],
  options: [
    {
      key: "mounting",
      label: "Mounting",
      values: [
        { value: "none", label: "None", pricePerUnit: "0", isDefault: true },
        { value: "four-holes", label: "4 screw holes", pricePerUnit: "0.5" },
      ],
    },
  ],
  tiers: GLOBAL_TIERS,
  settings: GBP,
};

function req(
  overrides: Partial<PriceRequest> & Pick<PriceRequest, "productSlug" | "materialSlug">,
): PriceRequest {
  return { widthMm: 50, heightMm: 50, quantity: 1, options: {}, variableData: false, ...overrides };
}

function quote(rules: PricingRules, request: PriceRequest): PriceQuote {
  const result = calculatePrice(rules, request);
  if (!result.ok) throw new Error(`Expected a price, got: ${JSON.stringify(result.errors)}`);
  return result.quote;
}

const stickerReq = (quantity: number, extra: Partial<PriceRequest> = {}) =>
  req({ productSlug: "custom-stickers", materialSlug: "gloss-vinyl", quantity, ...extra });

describe("worked examples from the plan", () => {
  it("100 stickers, 50 × 50 mm gloss vinyl: £16.20 incl. VAT", () => {
    // area 25 cm²; unit 0.05 + 25 × 0.004 = 0.15; list 15.00; 10% → 13.50; VAT 2.70; total 16.20
    const q = quote(stickers, stickerReq(100));
    expect(q.unit.net).toBe("0.15");
    expect(q.listNetMinor).toBe(1500);
    expect(q.tier).toEqual({ minQty: 100, percentOff: "10" });
    expect(q.discountMinor).toBe(150);
    expect(q.subtotalNetMinor).toBe(1350);
    expect(q.taxMinor).toBe(270);
    expect(q.totalGrossMinor).toBe(1620);
    expect(q.unitGrossDisplay).toBe("0.162");
  });

  it("99 stickers cost more than 100 (all-units price cliff) and the hint shows it", () => {
    // 99 × 0.15 = 14.85; no tier; VAT 2.97; total 17.82
    const q = quote(stickers, stickerReq(99));
    expect(q.tier).toBeNull();
    expect(q.totalGrossMinor).toBe(1782);
    expect(q.nextTier).toEqual({ minQty: 100, percentOff: "10", totalGrossMinor: 1620 });
  });

  it("500 personalised A5 Tyvek race numbers: £343.78 incl. VAT", () => {
    // area 310.8 cm²; unit 0.20 + 0.4662 + 0.05 = 0.7162; list 358.10; 20% → 286.48;
    // VAT 57.296 → 57.30; total 343.78
    const q = quote(
      raceNumbers,
      req({
        productSlug: "race-numbers",
        materialSlug: "tyvek",
        widthMm: 148,
        heightMm: 210,
        quantity: 500,
        variableData: true,
      }),
    );
    expect(q.areaCm2).toBe("310.8");
    expect(q.unit).toMatchObject({ material: "0.4662", variableData: "0.05", net: "0.7162" });
    expect(q.listNetMinor).toBe(35810);
    expect(q.lineNetMinor).toBe(28648);
    expect(q.taxMinor).toBe(5730);
    expect(q.totalGrossMinor).toBe(34378);
    expect(q.nextTier).toBeNull();
  });
});

describe("volume discount tiers", () => {
  it.each([
    [99, null],
    [100, "10"],
    [249, "10"],
    [250, "15"],
    [499, "15"],
    [500, "20"],
    [10000, "20"],
  ])("quantity %i gets %s%% off", (quantity, percent) => {
    const q = quote(stickers, stickerReq(quantity));
    expect(q.tier?.percentOff ?? null).toBe(percent);
  });

  it("applies the discount to every unit, not just those above the threshold", () => {
    // 250 × 0.15 = 37.50; 15% off all 250 → 31.875 → 31.88 (half-up)
    const q = quote(stickers, stickerReq(250));
    expect(q.lineNetMinor).toBe(3188);
    expect(q.discountMinor).toBe(3750 - 3188);
  });

  it("uses product-specific tiers instead of the global ones when present", () => {
    const rules = { ...stickers, tiers: [{ minQty: 50, percentOff: "5" }] };
    expect(quote(rules, stickerReq(60)).tier).toEqual({ minQty: 50, percentOff: "5" });
    expect(quote(rules, stickerReq(500)).tier).toEqual({ minQty: 50, percentOff: "5" });
  });

  it("tierFor picks the highest tier reached regardless of order", () => {
    const shuffled = [GLOBAL_TIERS[2]!, GLOBAL_TIERS[0]!, GLOBAL_TIERS[1]!];
    expect(tierFor(shuffled, 300)?.minQty).toBe(250);
    expect(tierFor(shuffled, 10)).toBeNull();
  });
});

describe("pricing models, materials, options and fees", () => {
  it("unit-priced products ignore area: a self-inking stamp is £16.80", () => {
    // 8 + 6 = 14.00 net; VAT 2.80
    const small = quote(
      stamps,
      req({ productSlug: "custom-stamps", materialSlug: "self-inking", widthMm: 38, heightMm: 14 }),
    );
    const large = quote(
      stamps,
      req({ productSlug: "custom-stamps", materialSlug: "self-inking", widthMm: 80, heightMm: 60 }),
    );
    expect(small.totalGrossMinor).toBe(1680);
    expect(large.totalGrossMinor).toBe(1680);
  });

  it("material choice changes the price", () => {
    // clear vinyl: 0.05 + 25 × 0.005 = 0.175 × 100 = 17.50; 10% → 15.75; VAT 3.15 → 18.90
    expect(quote(stickers, stickerReq(100, { materialSlug: "clear-vinyl" })).totalGrossMinor).toBe(
      1890,
    );
  });

  it("adds option prices and the one-off setup fee", () => {
    // 300 × 200 mm = 600 cm² × 0.012 = 7.20 + 2 base + 0.50 holes = 9.70; + £5 setup = 14.70;
    // VAT 2.94; total 17.64
    const q = quote(
      laserSigns,
      req({
        productSlug: "laser-cut-signs",
        materialSlug: "acrylic-clear-3",
        widthMm: 300,
        heightMm: 200,
        options: { mounting: "four-holes" },
      }),
    );
    expect(q.unit.options).toBe("0.5");
    expect(q.setupFeeMinor).toBe(500);
    expect(q.subtotalNetMinor).toBe(1470);
    expect(q.totalGrossMinor).toBe(1764);
  });

  it("fills in default option values when none are chosen", () => {
    const q = quote(stamps, req({ productSlug: "custom-stamps", materialSlug: "self-inking" }));
    expect(q.selectedOptions).toEqual({ ink: "black" });
  });

  it("uses the configured tax rate and currency (INR, 18% GST)", () => {
    // 100 stickers: 13.50 net; GST 2.43; total 15.93
    const rules = {
      ...stickers,
      settings: { currency: "INR" as const, taxRate: "0.18", taxLabel: "GST" },
    };
    const q = quote(rules, stickerReq(100));
    expect(q).toMatchObject({
      currency: "INR",
      taxLabel: "GST",
      taxMinor: 243,
      totalGrossMinor: 1593,
    });
  });

  it("rounds half-up once per line, not per unit", () => {
    // unit 0.05 + (21 × 21 / 100) × 0.004 = 0.06764; × 25 = 1.691 → 169p (per-unit rounding
    // would give 0.07 × 25 = 175p)
    const q = quote(stickers, stickerReq(25, { widthMm: 21, heightMm: 21 }));
    expect(q.unit.net).toBe("0.06764");
    expect(q.lineNetMinor).toBe(169);
  });

  it("derives orientation from the size", () => {
    expect(orientationOf(148, 210)).toBe("portrait");
    expect(orientationOf(210, 148)).toBe("landscape");
    expect(orientationOf(50, 50)).toBe("portrait");
  });
});

describe("validation", () => {
  const errorsOf = (rules: PricingRules, request: PriceRequest) => {
    const result = calculatePrice(rules, request);
    return result.ok ? [] : result.errors;
  };

  it("rejects sizes outside the product's limits", () => {
    expect(errorsOf(stickers, stickerReq(100, { widthMm: 10 }))).toEqual([
      { field: "widthMm", message: "Width must be between 20 and 300 mm." },
    ]);
    expect(errorsOf(stickers, stickerReq(100, { heightMm: 301 }))[0]?.field).toBe("heightMm");
  });

  it("rejects orientations the product is not made in", () => {
    const portraitOnly: PricingRules = {
      ...raceNumbers,
      product: { ...raceNumbers.product, orientations: ["portrait"] },
    };
    const errors = errorsOf(
      portraitOnly,
      req({
        productSlug: "race-numbers",
        materialSlug: "tyvek",
        widthMm: 210,
        heightMm: 148,
        quantity: 10,
      }),
    );
    expect(errors[0]?.message).toMatch(/only made in portrait/);
  });

  it("enforces minimum, maximum and step quantities", () => {
    expect(errorsOf(stickers, stickerReq(24))[0]?.message).toBe("The minimum order is 25.");
    expect(errorsOf(stickers, stickerReq(10001))[0]?.message).toMatch(
      /maximum online order is 10,000/,
    );
    const stepped: PricingRules = { ...stickers, product: { ...stickers.product, qtyStep: 25 } };
    expect(errorsOf(stepped, stickerReq(60))[0]?.message).toBe(
      "Quantity must go up in steps of 25.",
    );
    expect(errorsOf(stepped, stickerReq(75))).toEqual([]);
  });

  it("rejects unknown materials and option values", () => {
    expect(errorsOf(stickers, stickerReq(100, { materialSlug: "gold-leaf" }))[0]?.field).toBe(
      "materialSlug",
    );
    expect(
      errorsOf(
        stamps,
        req({
          productSlug: "custom-stamps",
          materialSlug: "self-inking",
          options: { ink: "glitter" },
        }),
      )[0]?.field,
    ).toBe("options");
  });

  it("rejects CSV personalisation for products that do not support it", () => {
    expect(errorsOf(stickers, stickerReq(100, { variableData: true }))[0]?.field).toBe(
      "variableData",
    );
  });

  it("reports every problem at once", () => {
    expect(
      errorsOf(stickers, stickerReq(1, { widthMm: 1, materialSlug: "x" })).map((e) => e.field),
    ).toEqual(["widthMm", "quantity", "materialSlug"]);
  });

  it("the request schema rejects non-numbers, fractions of a unit and junk", () => {
    const base = {
      productSlug: "custom-stickers",
      widthMm: 50,
      heightMm: 50,
      materialSlug: "gloss-vinyl",
      quantity: 100,
    };
    expect(priceRequestSchema.safeParse(base).success).toBe(true);
    expect(priceRequestSchema.safeParse({ ...base, quantity: 10.5 }).success).toBe(false);
    expect(priceRequestSchema.safeParse({ ...base, widthMm: "50" }).success).toBe(false);
    expect(priceRequestSchema.safeParse({ ...base, widthMm: Number.NaN }).success).toBe(false);
    expect(priceRequestSchema.safeParse({ ...base, quantity: -5 }).success).toBe(false);
  });
});
