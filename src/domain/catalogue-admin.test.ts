import { describe, expect, it } from "vitest";

import {
  changedFields,
  fromMinorUnits,
  productEditSchema,
  toMinorUnits,
  toProductPatch,
  type ProductEditInput,
} from "./catalogue-admin";

const MAT_A = "11111111-1111-4111-8111-111111111111";
const MAT_B = "22222222-2222-4222-8222-222222222222";

const valid: ProductEditInput = {
  productId: "33333333-3333-4333-8333-333333333333",
  name: "Custom Stickers",
  shortDescription: "Any size",
  isActive: true,
  baseUnitPrice: "0.05",
  setupFee: "5",
  variableDataUnitFee: "0",
  minWidthMm: "20",
  maxWidthMm: "300",
  minHeightMm: "20",
  maxHeightMm: "300",
  defaultWidthMm: "50",
  defaultHeightMm: "50",
  minQty: "10",
  maxQty: "10000",
  qtyStep: "10",
  bleedMm: "2",
  safeMarginMm: "3",
  outputDpi: "300",
  materials: [
    { materialId: MAT_A, offered: true, isDefault: true, pricePerCm2: "0.004", pricePerUnit: "0" },
    {
      materialId: MAT_B,
      offered: false,
      isDefault: false,
      pricePerCm2: "0.006",
      pricePerUnit: "0",
    },
  ],
  tiers: [
    { minQty: "100", percentOff: "10" },
    { minQty: "500", percentOff: "20" },
  ],
};

const errors = (input: ProductEditInput) => {
  const result = productEditSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe("productEditSchema", () => {
  it("accepts a consistent product and converts form strings", () => {
    const parsed = productEditSchema.parse(valid);
    expect(parsed.minWidthMm).toBe(20);
    expect(parsed.tiers[1]).toEqual({ minQty: 500, percentOff: "20" });
    expect(toProductPatch(parsed)).toMatchObject({
      setup_fee_minor: 500,
      base_unit_price: "0.05",
      default_width_mm: 50,
      short_description: "Any size",
    });
  });

  it("rejects inconsistent size and quantity limits", () => {
    expect(errors({ ...valid, maxWidthMm: "10" })).toContain("Maximum width is below the minimum");
    expect(errors({ ...valid, defaultHeightMm: "400" })).toContain(
      "Default height must be within the size limits",
    );
    expect(errors({ ...valid, maxQty: "5" })).toContain("Maximum quantity is below the minimum");
    expect(errors({ ...valid, minWidthMm: "0" })).toContain("Minimum width must be more than 0 mm");
  });

  it("rejects bad prices instead of rounding them", () => {
    expect(errors({ ...valid, baseUnitPrice: "0.123456" })[0]).toMatch(/up to 4 decimals/);
    expect(errors({ ...valid, setupFee: "-1" })[0]).toMatch(/Setup fee/);
    expect(errors({ ...valid, baseUnitPrice: "1e3" })[0]).toMatch(/Base price/);
  });

  it("needs exactly one offered default material", () => {
    const none = valid.materials.map((m) => ({ ...m, offered: false, isDefault: false }));
    expect(errors({ ...valid, materials: none })).toContain("Offer at least one material");
    const hiddenDefault = [
      { ...valid.materials[0]!, isDefault: false },
      { ...valid.materials[1]!, isDefault: true },
    ];
    expect(errors({ ...valid, materials: hiddenDefault })).toContain(
      "The default material must be offered",
    );
  });

  it("needs discount tiers that grow with quantity", () => {
    expect(
      errors({
        ...valid,
        tiers: [
          { minQty: "100", percentOff: "10" },
          { minQty: "100", percentOff: "15" },
        ],
      }),
    ).toContain("Two discount tiers start at 100");
    expect(
      errors({
        ...valid,
        tiers: [
          { minQty: "500", percentOff: "5" },
          { minQty: "100", percentOff: "10" },
        ],
      }),
    ).toContain("Larger quantities must get a larger discount");
    expect(errors({ ...valid, tiers: [{ minQty: "1", percentOff: "10" }] })[0]).toMatch(
      /at least 2/,
    );
    expect(errors({ ...valid, tiers: [] })).toEqual([]);
  });
});

describe("money and diffs", () => {
  it("converts setup fees exactly", () => {
    expect(toMinorUnits("5")).toBe(500);
    expect(toMinorUnits("0.29")).toBe(29); // 0.29 * 100 is 28.999… in floating point
    expect(fromMinorUnits(1250)).toBe("12.50");
  });

  it("lists only changed fields, comparing decimals by value", () => {
    expect(
      changedFields(
        { base_unit_price: "0.0500", name: "A", min_qty: 10 },
        { base_unit_price: "0.05", name: "B", min_qty: 10 },
      ),
    ).toEqual({ name: { from: "A", to: "B" } });
  });
});
