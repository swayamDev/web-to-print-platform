import { expect, test } from "@playwright/test";

import { adminUser, local, logIn } from "./support/orders";

test("public canonicals and sitemap omit configuration parameters and private routes", async ({
  page,
  request,
}) => {
  const urls = await request.get("/sitemap.xml");
  expect(urls.ok()).toBe(true);
  const sitemap = await urls.text();
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  const robotsText = await robots.text();
  const sitemapUrl = robotsText.match(/^Sitemap: (\S+)$/m)?.[1];
  expect(sitemapUrl).toBeTruthy();
  const origin = new URL(sitemapUrl!).origin;
  expect(sitemapUrl).toBe(`${origin}/sitemap.xml`);
  const entries = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((entry) => new URL(entry[1]!));
  expect(entries.length).toBeGreaterThanOrEqual(14);
  for (const url of entries) {
    expect(url.origin).toBe(origin);
    expect(url.search).toBe("");
    expect(url.pathname).toMatch(/^\/(?:gallery|(?:d|p)\/[^/]+)?$/);
  }
  for (const [route, canonical] of [
    ["/", "/"],
    ["/gallery?division=labels-stickers", "/gallery"],
    ["/d/labels-stickers", "/d/labels-stickers"],
    ["/p/custom-stickers?q=100", "/p/custom-stickers"],
  ]) {
    await page.goto(route!);
    const canonicalLink = page.locator('link[rel="canonical"]');
    await expect(canonicalLink).toHaveCount(1);
    expect(new URL((await canonicalLink.getAttribute("href"))!).href).toBe(
      new URL(canonical!, origin).href,
    );
    await expect(page).toHaveTitle(/Digital Heroes Print/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /\S/);
    expect(entries.some((entry) => entry.pathname === canonical)).toBe(true);
  }
});

test("private workflows send noindex and keep sign-in and staff guards", async ({
  page,
  request,
}) => {
  test.skip(!local, "checks the local candidate and disposable roles");
  for (const route of ["/account/orders", "/admin/orders", "/reset-password"]) {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toContain("/login");
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  }
  for (const route of ["/login", "/signup", "/forgot-password"]) {
    const response = await request.get(route);
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  }
  await logIn(page);
  const account = await page.goto("/account/orders");
  expect(account?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  const denied = await page.goto("/admin/orders");
  expect(denied?.status()).toBe(404);
});

test("staff section navigation reveals each keyboard-focused link on a narrow screen", async ({
  page,
}) => {
  test.skip(!local, "uses a local staff fixture");
  await page.setViewportSize({ width: 320, height: 800 });
  await logIn(page, adminUser);
  const response = await page.goto("/admin/orders");
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  const nav = page.getByRole("navigation", { name: "Admin sections" });
  await expect(nav.getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
  const labels = ["Overview", "Orders", "Production", "Products", "Templates", "Reports", "Users"];
  await nav.getByRole("link", { name: labels[0] }).focus();
  for (const [index, label] of labels.entries()) {
    if (index > 0) await page.keyboard.press("Tab");
    const link = nav.getByRole("link", { name: label });
    await expect(link).toBeFocused();
    await expect
      .poll(() =>
        link.evaluate((element) => {
          const { left, right, height } = element.getBoundingClientRect();
          const bounds = element.closest("nav")!.getBoundingClientRect();
          return height >= 44 && left >= bounds.left - 1 && right <= bounds.right + 1;
        }),
      )
      .toBe(true);
  }
  expect(await nav.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
