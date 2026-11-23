import { expect, test } from "@playwright/test";

/** Public catalogue: home hub, division pages, product pages (PRD p4 §03, p8 §12). */

test("home page shows the six-division hub", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Digital Heroes Print/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Custom print");

  const hub = page.locator("#products ul").first();
  await expect(hub.getByRole("link")).toHaveCount(6);
  for (const name of [
    "Labels & Stickers",
    "Race & Event Numbers",
    "MTB Boards",
    "Stamps",
    "Trophies",
    "Laser-Cut Work",
  ]) {
    await expect(hub.getByRole("heading", { name })).toBeVisible();
  }
});

test("a visitor can browse from a hub tile to a product specification", async ({ page }) => {
  await page.goto("/");
  await page
    .locator("#products")
    .getByRole("link", { name: /Race & Event Numbers/ })
    .click();

  await expect(page).toHaveURL(/\/d\/race-event-numbers$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Race & Event Numbers");

  await page.getByRole("link", { name: /Race Numbers[\s\S]*View product/ }).click();
  await expect(page).toHaveURL(/\/p\/race-numbers$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Race Numbers");
  // Scope to the spec section: Next keeps the previous page mounted (hidden) for back/forward.
  const specs = page.getByRole("region", { name: "Specification" });
  await expect(specs.getByText("100–297 mm")).toBeVisible();
  await expect(specs.getByText("Tyvek")).toBeVisible();
  await expect(page.getByText("Personalise each item from a CSV")).toBeVisible();
});

test("unknown divisions and products show the not-found page", async ({ page }) => {
  // These pages stream, so the 404 is rendered in-page (marked noindex) rather than as an
  // HTTP status. That keeps admin-added divisions working without a rebuild (PRD p9 §14).
  for (const path of ["/d/does-not-exist", "/p/does-not-exist", "/no-such-page"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
});

test("the page never scrolls sideways", async ({ page }) => {
  for (const path of ["/", "/d/laser-cut", "/p/custom-stamps", "/login"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
});
