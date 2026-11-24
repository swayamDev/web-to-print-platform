import { expect, test } from "@playwright/test";

/**
 * Gallery (PRD R-45): work organised by product family, filterable by division, every piece
 * labelled as sample work (DECISIONS D-19) and drawn by the print engine.
 */

test("the gallery filters by division and links each piece to its product", async ({
  page,
  request,
}) => {
  await page.goto("/gallery");
  const grid = page.getByTestId("gallery-grid");
  // 12 seeded pieces (another spec may briefly hide one template while running in parallel).
  await expect(grid.getByRole("listitem").nth(9)).toBeVisible();
  const pieces = await grid.getByRole("listitem").count();
  await expect(grid.getByText("Sample work")).toHaveCount(pieces);

  await page
    .getByRole("navigation", { name: "Filter by division" })
    .getByRole("link", { name: "Race & Event Numbers" })
    .click();
  await expect(page).toHaveURL(/\/gallery\?division=race-event-numbers$/);
  await expect(grid.getByRole("listitem")).toHaveCount(2);
  await expect(grid).toContainText("City 10K bibs");

  // Every image is a real PNG from the print engine, cached for the CDN.
  const src = await grid.getByRole("img").first().getAttribute("src");
  const image = await request.get(src!);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(image.headers()["cache-control"]).toContain("s-maxage");

  await grid
    .getByRole("link", { name: /Make one like this/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/p\/race-numbers$/);
});

test("division pages and the home page show sample work", async ({ page }) => {
  await page.goto("/d/mtb-boards");
  await expect(page.getByRole("heading", { name: "Sample work" })).toBeVisible();
  await expect(page.getByTestId("gallery-grid").getByRole("listitem")).toHaveCount(2);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Made on this platform" })).toBeVisible();
  // One piece per division.
  await expect(page.getByTestId("gallery-grid").getByRole("listitem").nth(4)).toBeVisible();
});

test("unknown gallery images are not found", async ({ request }) => {
  expect((await request.get("/api/v1/gallery/not-a-uuid/image")).status()).toBe(404);
  expect(
    (await request.get("/api/v1/gallery/00000000-0000-4000-8000-000000000000/image")).status(),
  ).toBe(404);
});
