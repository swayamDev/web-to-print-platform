import { expect, test } from "@playwright/test";

/**
 * PRD testing checklist (p10 §16): "Product configuration & live pricing" and
 * "Volume-discount calculation", through the real configurator UI. Prices use the seeded
 * sample rates (see src/domain/pricing.test.ts for the arithmetic).
 */

const total = (page: import("@playwright/test").Page) => page.getByTestId("price-total");

test("a visitor configures stickers and sees the discounted price, confirmed by the server", async ({
  page,
}) => {
  await page.goto("/p/custom-stickers");
  await expect(total(page)).toHaveText("£16.20");
  await expect(page.getByText("Volume discount: 10% off every item")).toBeVisible();
  await expect(page.getByTestId("price-confirmed")).toBeVisible();
  await expect(page).toHaveURL(/q=100/);
});

test("99 items cost more than 100, and the hint takes you to the cheaper order", async ({
  page,
}) => {
  await page.goto("/p/custom-stickers");
  await page.getByLabel("How many?").fill("99");
  await expect(total(page)).toHaveText("£17.82");

  const hint = page.getByRole("button", { name: /Order 1 more and pay less/ });
  await expect(hint).toContainText("£1.62 less");
  await hint.click();
  await expect(page.getByLabel("How many?")).toHaveValue("100");
  await expect(total(page)).toHaveText("£16.20");
});

test("sizes outside the product's limits are explained instead of priced", async ({ page }) => {
  await page.goto("/p/custom-stickers");
  await page.getByLabel("Width (mm)").fill("10");
  await expect(page.getByText("Width must be between 20 and 300 mm.")).toBeVisible();
  await expect(page.getByText("Fix the highlighted fields to see your price.")).toBeVisible();

  await page.getByLabel("Width (mm)").fill("50");
  await expect(total(page)).toHaveText("£16.20");
});

test("personalising race numbers from a CSV adds the per-item fee and is kept in the URL", async ({
  page,
}) => {
  await page.goto("/p/race-numbers");
  await expect(total(page)).toHaveText("£71.95"); // 100 A5 Tyvek bibs

  await page.getByLabel(/Different name and number on every item/).check();
  await expect(total(page)).toHaveText("£77.35");
  await expect(page).toHaveURL(/vd=1/);

  await page.reload();
  await expect(page.getByLabel(/Different name and number on every item/)).toBeChecked();
  await expect(total(page)).toHaveText("£77.35");
});

test("a shared quote link restores size, material, options and quantity", async ({ page }) => {
  // 3 wooden stamps: (8 + 2) × 3 = £30.00 + VAT £6.00
  await page.goto("/p/custom-stamps?w=38&h=14&m=wood-mount&q=3&opt.ink=red");
  await expect(page.getByLabel("Wooden handle")).toBeChecked();
  await expect(page.getByLabel("Red")).toBeChecked();
  await expect(total(page)).toHaveText("£36.00");
});

test("rotating a size swaps width and height", async ({ page }) => {
  await page.goto("/p/race-numbers");
  await page.getByRole("button", { name: "Rotate" }).click();
  await expect(page.getByLabel("Width (mm)")).toHaveValue("210");
  await expect(page.getByLabel("Height (mm)")).toHaveValue("148");
  await expect(page.getByText("Landscape", { exact: true })).toBeVisible();
});

test("the home calculator prices instantly and hands over to the full configurator", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Product", { exact: true }).selectOption("race-numbers");
  await page.getByRole("button", { name: "A6", exact: true }).click();
  await page.getByLabel("Quantity", { exact: true }).fill("500");
  // A6 = 155.4 cm²: (0.20 + 0.2331) × 500 = 216.55; 20% off → 173.24; VAT 34.65
  await expect(page.getByTestId("quick-price-total")).toHaveText("£207.89");

  await page.getByRole("link", { name: "Configure in full" }).click();
  await expect(page).toHaveURL(/\/p\/race-numbers\?w=105&h=148&m=tyvek&q=500/);
  await expect(total(page)).toHaveText("£207.89");
});

test("on phones the total stays visible in a bar at the bottom", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout only");
  await page.goto("/p/custom-stickers");
  await expect(page.getByTestId("mobile-price-total")).toHaveText("£16.20");
  await expect(page.getByTestId("mobile-price-total")).toBeInViewport();
});
