import { expect, test, type Page } from "@playwright/test";

/**
 * PRD testing checklist (p10 §16): "Designer — print-area constraints", plus saving designs to
 * the account (p5 §06, p7 §09). The race-number template is 148 × 210 mm with 3 mm bleed, so
 * the canvas shows a 154 × 216 mm page.
 */

const DESIGN_URL = "/design/new?product=race-numbers&w=148&h=210&m=tyvek&q=100";
const PAGE_MM = { w: 154, h: 216 };

const customer = {
  email: process.env.TEST_CUSTOMER_EMAIL ?? "",
  password: process.env.TEST_CUSTOMER_PASSWORD ?? "",
};

/** Screen position of a point given in page millimetres (bleed box, top-left origin). */
async function canvasPoint(page: Page, xMm: number, yMm: number) {
  const canvas = page.getByTestId("design-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  return { x: box.x + (xMm / PAGE_MM.w) * box.width, y: box.y + (yMm / PAGE_MM.h) * box.height };
}

async function openRaceTemplate(page: Page) {
  await page.goto("/p/race-numbers");
  await page.getByRole("link", { name: "Design online" }).click();
  await expect(page).toHaveURL(/\/design\/new\?product=race-numbers&template=/);
  await expect(page.getByTestId("print-check")).toContainText("Ready to print");
}

/** The NAME placeholder box centre: x 8 + 132/2 + bleed 3, y 145 + 22/2 + bleed 3. */
async function selectName(page: Page) {
  const point = await canvasPoint(page, 77, 159);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("element-panel")).toContainText("{NAME}");
}

test.describe("designer", () => {
  test.skip(({ isMobile }) => isMobile, "the touch layout arrives in Phase 7b");

  test("opens from the configurator with the template at the configured size", async ({ page }) => {
    await openRaceTemplate(page);
    await expect(page.getByText("Trim 148 × 210 mm")).toBeVisible();
    await expect(page.getByText("100 items · £71.95 incl. VAT")).toBeVisible();
  });

  test("long names shrink to fit their placeholder as you type", async ({ page }) => {
    await openRaceTemplate(page);
    await selectName(page);
    await expect(page.getByTestId("fit-status")).toHaveText("Printed at 48 pt");
    await page.getByLabel("Text", { exact: true }).fill("MAXIMILIANA WOLFESCHLEGELSTEIN");
    await expect(page.getByTestId("fit-status")).toContainText("Shrunk to fit");
    await expect(page.getByTestId("print-check")).toContainText("Ready to print");

    await page.getByLabel("Text", { exact: true }).fill("X".repeat(90));
    await expect(page.getByTestId("fit-status")).toContainText("Too long");
    await expect(page.getByTestId("print-check")).toContainText("does not fit");
  });

  test("dragging artwork off the print area is flagged, and undo puts it back", async ({
    page,
  }) => {
    await openRaceTemplate(page);
    await selectName(page);
    const from = await canvasPoint(page, 77, 159);
    const to = await canvasPoint(page, 10, 159);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId("print-check")).toContainText("outside the printable area");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("print-check")).toContainText("Ready to print");
  });

  test("adds and deletes text and shapes", async ({ page }) => {
    await openRaceTemplate(page);
    await page.getByRole("button", { name: "Add text" }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Your text");
    await page.getByRole("button", { name: "Delete element" }).click();
    await expect(page.getByTestId("element-panel")).toHaveCount(0);

    await page.getByRole("button", { name: "Add shape" }).click();
    await expect(page.getByTestId("element-panel")).toContainText("Shape");
    await expect(page.getByTestId("print-check")).toContainText("Ready to print");
  });

  test("a visitor saves after logging in, then reopens the design from the account", async ({
    page,
  }) => {
    await openRaceTemplate(page);
    await selectName(page);
    const name = `RUNNER ${Date.now() % 100000}`;
    await page.getByLabel("Text", { exact: true }).fill(name);
    await page.getByLabel("Design name").fill(`E2E bib ${name}`);
    await page.getByRole("button", { name: "Save" }).click();

    // Not signed in: the draft is kept and the visitor is sent to log in.
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByLabel("Email").fill(customer.email);
    await page.getByLabel("Password").fill(customer.password);
    await page.getByRole("button", { name: "Log in" }).click();

    // Back in the designer, the draft is restored and saved to the account.
    await expect(page).toHaveURL(/\/design\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("save-status")).toContainText("Saved");

    await page.goto("/account/designs");
    await page.getByRole("link", { name: `E2E bib ${name}` }).click();
    await expect(page.getByTestId("print-check")).toContainText("Ready to print");
    await selectName(page);
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(name);
  });

  test("a design can only be opened by its owner", async ({ page, browser }) => {
    // Customer saves a design.
    await page.goto("/login");
    await page.getByLabel("Email").fill(customer.email);
    await page.getByLabel("Password").fill(customer.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(DESIGN_URL);
    await expect(page.getByTestId("print-check")).toContainText("Ready to print");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/design\/[0-9a-f-]{36}$/);
    const designUrl = page.url();

    // A different, newly registered customer gets "not found".
    const other = await browser.newPage();
    await other.goto("/signup");
    await other.getByLabel("Full name").fill("Other Customer");
    await other
      .getByLabel("Email")
      .fill(`e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`);
    await other.getByLabel("Password").fill("another-pass-42");
    await other.getByRole("button", { name: "Create account" }).click();
    await expect(other).toHaveURL(/\/account$/);
    await other.goto(designUrl);
    await expect(other.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await other.close();
  });
});
