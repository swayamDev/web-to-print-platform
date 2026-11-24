import { expect, test, type Page } from "@playwright/test";

import { adminUser, createQuoteOrder, local, logIn } from "./support/orders";

/**
 * Mobile-first layout (PRD R-49: "works at 360 px wide"): no page scrolls sideways at a small
 * phone, a tablet or a laptop width.
 */

const WIDTHS = [360, 768, 1280];

async function sidewaysOverflow(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const over = document.documentElement.scrollWidth - width;
    // Name the widest offender to make a failure easy to fix.
    const culprit = [...document.querySelectorAll("body *")]
      .filter((e) => e.checkVisibility() && e.getBoundingClientRect().right > width + 1)
      .map(
        (e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ").slice(0, 3).join(".")}`,
      )
      .at(-1);
    return over > 0 ? `${over}px (${culprit})` : null;
  });
}

test.describe("responsive layout", () => {
  test.skip(({ isMobile }) => isMobile, "widths are set explicitly");

  for (const width of WIDTHS) {
    test(`public pages fit ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        "/",
        "/gallery",
        "/d/race-event-numbers",
        "/p/race-numbers",
        "/login",
        "/signup",
      ]) {
        expect(await sidewaysOverflow(page, path), `${path} at ${width}px`).toBeNull();
      }
    });

    test(`signed-in pages fit ${width} px`, async ({ page }) => {
      test.skip(!local, "creates an order with the secret key");
      const order = await createQuoteOrder();
      await page.setViewportSize({ width, height: 900 });
      await logIn(page);
      for (const path of [
        "/account",
        "/account/orders",
        `/account/orders/${order.id}`,
        "/account/designs",
      ]) {
        expect(await sidewaysOverflow(page, path), `${path} at ${width}px`).toBeNull();
      }
      await page.context().clearCookies();
      await logIn(page, adminUser);
      for (const path of [
        "/admin",
        "/admin/orders",
        `/admin/orders/${order.id}`,
        "/admin/products",
        "/admin/templates",
        "/admin/reports",
        "/admin/users",
      ]) {
        expect(await sidewaysOverflow(page, path), `${path} at ${width}px`).toBeNull();
      }
    });
  }
});
