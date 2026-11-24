import { expect, test } from "@playwright/test";

/**
 * Performance guards (PRD R-49 "fast"): public pages do not shift while loading (CLS under the
 * 0.1 "good" threshold) and every image reserves its space.
 */

for (const path of ["/", "/gallery", "/d/race-event-numbers", "/p/race-numbers"]) {
  test(`${path} loads without layout shift`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            })[]) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => resolve(total), 300);
        }),
    );
    expect(cls, "cumulative layout shift").toBeLessThan(0.1);

    const unsized = await page.evaluate(() =>
      [...document.images]
        .filter((img) => !img.getAttribute("width") || !img.getAttribute("height"))
        .map((img) => img.src),
    );
    expect(unsized, "images without width and height").toEqual([]);
  });
}
