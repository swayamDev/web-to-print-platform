import { expect, test } from "@playwright/test";

import { adminUser, local, logIn } from "./support/orders";

test("public canonicals and sitemap omit configuration parameters and private routes", async ({
  page,
  request,
}) => {
  test.slow();
  const urls = await request.get("/sitemap.xml");
  expect(urls.ok()).toBe(true);
  const sitemap = await urls.text();
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  const robotsText = await robots.text();
  const sitemapUrl = robotsText.match(/^Sitemap: (\S+)$/m)?.[1];
  expect(sitemapUrl).toBeTruthy();
  const configuredUrl =
    process.env.E2E_CANONICAL_ORIGIN ?? (local ? process.env.APP_URL : process.env.E2E_BASE_URL);
  expect(configuredUrl, "expected canonical origin from test configuration").toBeTruthy();
  const origin = new URL(configuredUrl!).origin;
  expect(sitemapUrl).toBe(`${origin}/sitemap.xml`);
  const entries = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((entry) => new URL(entry[1]!));
  expect(entries.length).toBeGreaterThanOrEqual(14);
  for (const url of entries) {
    expect(url.origin).toBe(origin);
    expect(url.search).toBe("");
    expect(url.pathname).toMatch(/^\/(?:gallery|(?:d|p)\/[^/]+)?$/);
  }
  for (const [route, canonical] of [
    ...entries.map(({ pathname }) => [pathname, pathname]),
    ["/gallery?division=labels-stickers", "/gallery"],
    ["/p/custom-stickers?q=100", "/p/custom-stickers"],
  ]) {
    const response = await page.goto(route!);
    const html = await response!.text();
    const serverCanonicals = html.match(/<link\b[^>]*\brel="canonical"[^>]*>/g) ?? [];
    expect(serverCanonicals, `server canonicals on ${route}`).toHaveLength(1);
    await page.waitForLoadState("networkidle");
    const canonicalLink = page.locator('link[rel="canonical"]');
    await expect(canonicalLink, `hydrated canonical on ${route}`).toHaveCount(1);
    expect(new URL((await canonicalLink.getAttribute("href"))!).href).toBe(
      new URL(canonical!, origin).href,
    );
    await expect(page).toHaveTitle(/Digital Heroes Print/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /\S/);
    expect(entries.some((entry) => entry.pathname === canonical)).toBe(true);
  }
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Product", { exact: true }).selectOption("race-numbers");
  await expect(page.getByRole("button", { name: "A6", exact: true })).toBeVisible();
  await page.locator('#products a[href="/d/labels-stickers"]').click();
  await page.waitForURL("**/d/labels-stickers");
  await expect(page.getByRole("heading", { level: 1, name: "Labels & Stickers" })).toBeVisible();
  const clientCanonical = page.locator('link[rel="canonical"]');
  await expect
    .poll(() =>
      clientCanonical.evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
    )
    .toEqual([`${origin}/d/labels-stickers`]);
  await expect(clientCanonical).toHaveCount(1);
  await expect(clientCanonical).toHaveAttribute("href", `${origin}/d/labels-stickers`);
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
