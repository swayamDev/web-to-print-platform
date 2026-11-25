import { expect, test } from "@playwright/test";

/**
 * Server-side print rendering (PRD p6 §07), end to end through the deployed route: the
 * product page shows server-rendered template previews and links to a print-ready PDF.
 * Detailed file checks (boxes, fonts, DPI) live in src/lib/print/print.test.ts.
 */
test.describe("server-rendered templates", () => {
  test.skip(({ isMobile }) => isMobile, "rendering does not depend on the viewport");

  test("product page shows a server-rendered PNG preview of each template", async ({ page }) => {
    await page.goto("/p/race-numbers");
    const preview = page.getByRole("img", { name: "Classic Bib template preview" });
    await preview.scrollIntoViewIfNeeded();
    await expect(preview).toBeVisible();
    await expect
      .poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(400);
    // Loaded (not a broken image), at the template's real proportions (154 × 216 mm with bleed).
    const size = await preview.evaluate((img: HTMLImageElement) => ({
      w: img.naturalWidth,
      h: img.naturalHeight,
    }));
    expect(size.w).toBeGreaterThan(400);
    expect(size.h / size.w).toBeCloseTo(216 / 154, 2);
  });

  test("the print-ready PDF and PNG have the right type, size and resolution", async ({
    page,
    request,
  }) => {
    await page.goto("/p/race-numbers");
    const pdfHref = await page
      .getByRole("link", { name: "Print-ready PDF" })
      .first()
      .getAttribute("href");
    expect(pdfHref).toMatch(/\/api\/v1\/templates\/[0-9a-f-]{36}\/preview\?format=pdf/);

    const pdf = await request.get(pdfHref!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    const pdfBody = await pdf.body();
    expect(pdfBody.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdfBody.toString("latin1")).toContain("/TrimBox");

    const png = await request.get(pdfHref!.replace("format=pdf", "format=png&dpi=300&guides=0"));
    expect(png.status()).toBe(200);
    const pngBody = await png.body();
    // 154 × 216 mm at 300 DPI = 1819 × 2551 px, with 300 DPI recorded in the file.
    expect(pngBody.readUInt32BE(16)).toBe(1819);
    expect(pngBody.readUInt32BE(20)).toBe(2551);
    const phys = pngBody.indexOf("pHYs");
    expect(Math.round(pngBody.readUInt32BE(phys + 4) * 0.0254)).toBe(300);
  });

  test("rejects unknown templates and bad options", async ({ request }) => {
    expect((await request.get("/api/v1/templates/not-a-uuid/preview")).status()).toBe(404);
    expect(
      (
        await request.get("/api/v1/templates/00000000-0000-0000-0000-000000000000/preview")
      ).status(),
    ).toBe(404);
    const pdfHref = "/api/v1/templates/00000000-0000-0000-0000-000000000000/preview?dpi=5000";
    expect((await request.get(pdfHref)).status()).toBe(400);
  });
});
