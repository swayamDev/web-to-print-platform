import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { adminUser, createQuoteOrder, local, logIn } from "./support/orders";

/**
 * Accessibility (PRD R-49, p10 §16): automated WCAG 2.1 A/AA checks with axe on every main
 * page, signed out, as a customer and as an admin, at the phone and desktop viewports.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function problems(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join("\n    ")}`,
  );
}

async function expectAccessible(page: Page, path: string) {
  await page.goto(path);
  // Wait for streamed content (no loading skeleton left) before scanning.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  expect(await problems(page), `${path} has accessibility problems`).toEqual([]);
}

const PUBLIC = [
  "/",
  "/gallery",
  "/d/labels-stickers",
  "/p/custom-stickers",
  "/p/race-numbers",
  "/login",
  "/signup",
  "/forgot-password",
];

test.describe("accessibility", () => {
  // Scan the settled page: with reduced motion nothing is mid-animation (and that path is checked).
  test.use({ reducedMotion: "reduce" });

  for (const path of PUBLIC) {
    test(`${path} meets WCAG 2.1 AA`, async ({ page }) => {
      await expectAccessible(page, path);
    });
  }

  test("the designer meets WCAG 2.1 AA", async ({ page }) => {
    await page.goto("/p/race-numbers");
    await page.getByRole("link", { name: "Design online" }).click();
    await expect(page.getByTestId("print-check")).toContainText("Ready to print");
    // Let the client navigation finish first (a scan mid-navigation can catch transient attributes).
    await page.waitForLoadState("networkidle");
    expect(await problems(page), "the designer has accessibility problems").toEqual([]);
  });

  test("customer pages meet WCAG 2.1 AA", async ({ page }) => {
    test.skip(!local, "creates an order with the secret key");
    const order = await createQuoteOrder();
    await logIn(page);
    for (const path of [
      "/account",
      "/account/orders",
      `/account/orders/${order.id}`,
      "/account/designs",
      "/account/profile",
    ]) {
      await expectAccessible(page, path);
    }
  });

  test("admin pages meet WCAG 2.1 AA", async ({ page, isMobile }) => {
    test.skip(isMobile, "admin pages are checked on desktop");
    test.skip(!local, "creates an order with the secret key");
    const order = await createQuoteOrder();
    await logIn(page, adminUser);
    for (const path of [
      "/admin",
      "/admin/orders",
      `/admin/orders/${order.id}`,
      "/admin/production",
      "/admin/products",
      "/admin/templates",
      "/admin/reports",
      "/admin/users",
    ]) {
      await expectAccessible(page, path);
    }
  });
});
