import { Resvg } from "@resvg/resvg-js";
import { expect, test, type Page } from "@playwright/test";

import {
  admin,
  createQuoteOrder,
  createStickerDesign,
  customer,
  local,
  logIn,
  payOrder,
} from "./support/orders";

/**
 * Security hardening (Phase 17; PRD p10 §16 "error handling" and "edge cases"): security
 * headers on every response, a Content-Security-Policy that real flows never trip, and
 * API endpoints that answer bad input with clear 4xx errors.
 */

/** Collect CSP violations from the moment the page starts. */
async function watchCsp(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.violatedDirective} blocked ${e.blockedURI}`,
      );
    });
  });
  return () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

const logo = () =>
  Buffer.from(
    new Resvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#1f3a2e"/><circle cx="5" cy="5" r="3" fill="#f4c430"/></svg>`,
      { fitTo: { mode: "width", value: 600 } },
    )
      .render()
      .asPng(),
  );

test.describe("security", () => {
  test("pages and APIs send security headers", async ({ request }) => {
    for (const path of ["/", "/api/v1/gallery/00000000-0000-4000-8000-000000000000/image"]) {
      const response = await request.get(path);
      const h = response.headers();
      expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
      expect(h["content-security-policy"], path).toContain("object-src 'none'");
      expect(h["x-content-type-options"], path).toBe("nosniff");
      expect(h["x-frame-options"], path).toBe("DENY");
      expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      expect(h["permissions-policy"], path).toContain("camera=()");
      expect(h["x-powered-by"], path).toBeUndefined();
    }
  });

  test("the public site, the designer and an upload run without CSP violations", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "same policy on every viewport");
    const violations = await watchCsp(page);
    for (const path of ["/", "/gallery", "/p/race-numbers"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await violations(), path).toEqual([]);
    }

    // Designer with fonts, canvas and a direct upload to storage plus its preview.
    await logIn(page);
    await page.goto("/p/custom-stickers");
    await page.getByRole("link", { name: "Design online" }).click();
    await expect(page.getByTestId("print-check")).toContainText("Ready to print");
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: /Add image|Replace image/ })
      .first()
      .click();
    await (await chooser).setFiles({ name: "logo.png", mimeType: "image/png", buffer: logo() });
    await expect(page.getByTestId("image-info")).toContainText("600 × 600 px");
    await page.waitForLoadState("networkidle");
    expect(await violations(), "designer and upload").toEqual([]);
  });

  test("proof images from private storage load under the CSP", async ({
    page,
    request,
    isMobile,
  }) => {
    test.skip(isMobile, "same policy on every viewport");
    test.skip(!local, "needs signed test webhooks");
    const design = await createStickerDesign("CSP CHECK");
    const order = await createQuoteOrder(1620, design);
    await payOrder(request, order);
    await expect
      .poll(
        async () =>
          (await admin().from("proof_versions").select("id").eq("order_id", order.id)).data?.length,
        { timeout: 60_000 },
      )
      .toBe(1);
    const violations = await watchCsp(page);
    await logIn(page);
    await page.goto(`/account/orders/${order.id}`);
    const image = page.getByTestId("proof-image");
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
    expect(await violations()).toEqual([]);
  });

  test("bad API input gets clear errors, never a crash", async ({ request }) => {
    const price = (data: unknown) => request.post("/api/v1/price", { data });
    expect((await price("not json at all")).status()).toBe(400);
    expect(
      (
        await price({
          productSlug: "no-such-product",
          widthMm: 50,
          heightMm: 50,
          materialSlug: "x",
          quantity: 1,
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await price({
          productSlug: "custom-stickers",
          widthMm: -5,
          heightMm: 50,
          materialSlug: "gloss-vinyl",
          quantity: 100,
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await price({
          productSlug: "custom-stickers",
          widthMm: 5000,
          heightMm: 50,
          materialSlug: "gloss-vinyl",
          quantity: 100,
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await price({
          productSlug: "custom-stickers",
          widthMm: 50,
          heightMm: 50,
          materialSlug: "gloss-vinyl",
          quantity: 1e12,
        })
      ).status(),
    ).toBeGreaterThanOrEqual(400);

    // Webhooks without a valid signature are refused.
    const webhook = await request.post("/api/v1/webhooks/stripe", {
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=forged" },
      data: JSON.stringify({ type: "checkout.session.completed" }),
    });
    expect(webhook.status()).toBe(400);

    // Private files and documents are 404 to strangers, whatever the id looks like.
    for (const path of [
      "/api/v1/invoices/../../etc/passwd",
      "/api/v1/invoices/00000000-0000-4000-8000-000000000000",
      "/api/v1/admin/production-files/00000000-0000-4000-8000-000000000000",
      "/api/v1/admin/exports/xero?period=month",
    ]) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
  });

  test("login does not reveal which emails have accounts", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.invalid`);
    await page.getByLabel("Password").fill("wrong-password-1");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();

    // An off-site ?next= is ignored after logging in (no open redirect).
    await page.goto("/login?next=https://evil.example/steal");
    await page.getByLabel("Email").fill(customer.email);
    await page.getByLabel("Password").fill(customer.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });
});
