import { expect, test } from "@playwright/test";

/**
 * PRD testing checklist (p10 §16): "Product configuration & live pricing" and
 * "Volume-discount calculation", through the real API and the seeded database rules.
 */
test.describe("price API", () => {
  test.skip(({ isMobile }) => isMobile, "API test: one viewport is enough");

  const price = (request: import("@playwright/test").APIRequestContext, data: unknown) =>
    request.post("/api/v1/price", { data });

  const stickers = {
    productSlug: "custom-stickers",
    widthMm: 50,
    heightMm: 50,
    materialSlug: "gloss-vinyl",
    quantity: 100,
  };

  test("prices 100 stickers at £16.20 including VAT with the 10% tier", async ({ request }) => {
    const response = await price(request, stickers);
    expect(response.status()).toBe(200);
    const { quote } = await response.json();
    expect(quote).toMatchObject({
      currency: "GBP",
      taxLabel: "VAT",
      tier: { minQty: 100, percentOff: "10" },
      subtotalNetMinor: 1350,
      taxMinor: 270,
      totalGrossMinor: 1620,
    });
  });

  test("99 stickers get no discount and a hint about the next tier", async ({ request }) => {
    const { quote } = await (await price(request, { ...stickers, quantity: 99 })).json();
    expect(quote.tier).toBeNull();
    expect(quote.totalGrossMinor).toBe(1782);
    expect(quote.nextTier).toEqual({ minQty: 100, percentOff: "10", totalGrossMinor: 1620 });
  });

  test("prices 500 personalised A5 race numbers at £343.78", async ({ request }) => {
    const response = await price(request, {
      productSlug: "race-numbers",
      widthMm: 148,
      heightMm: 210,
      materialSlug: "tyvek",
      quantity: 500,
      variableData: true,
    });
    const { quote } = await response.json();
    expect(quote.tier.percentOff).toBe("20");
    expect(quote.totalGrossMinor).toBe(34378);
  });

  test("ignores any price the client tries to send", async ({ request }) => {
    const { quote } = await (
      await price(request, { ...stickers, totalGrossMinor: 1, unitPrice: 0, taxRate: 0 })
    ).json();
    expect(quote.totalGrossMinor).toBe(1620);
  });

  test("explains why an out-of-range configuration cannot be ordered", async ({ request }) => {
    const response = await price(request, { ...stickers, widthMm: 5, quantity: 10 });
    expect(response.status()).toBe(422);
    const { errors } = await response.json();
    expect(errors).toEqual([
      { field: "widthMm", message: "Width must be between 20 and 300 mm." },
      { field: "quantity", message: "The minimum order is 25." },
    ]);
  });

  test("rejects malformed requests and unknown products", async ({ request }) => {
    expect((await price(request, { ...stickers, widthMm: "50" })).status()).toBe(400);
    expect((await price(request, { ...stickers, quantity: 2.5 })).status()).toBe(400);
    expect((await price(request, { ...stickers, productSlug: "no-such-product" })).status()).toBe(
      404,
    );

    const notJson = await request.post("/api/v1/price", {
      headers: { "Content-Type": "application/json" },
      data: "not json",
    });
    expect(notJson.status()).toBe(400);
  });
});
