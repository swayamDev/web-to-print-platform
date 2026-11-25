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

/** Drag from one page-mm point to another with real pointer movements. */
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await canvasPoint(page, ...from);
  const b = await canvasPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
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

  test("dragging stops at the edge: artwork cannot be dragged off the print area", async ({
    page,
  }) => {
    await openRaceTemplate(page);
    await selectName(page);
    // On phones the panel slides up from the bottom: scroll the name up above it first.
    const start = await canvasPoint(page, 77, 159);
    await page.evaluate((dy) => window.scrollBy(0, dy), Math.max(0, start.y - 200));
    const visible = await canvasPoint(page, 77, 159);
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      visible,
    );
    expect(hit, "the name should be visible above the panel").toBe("CANVAS");
    await drag(page, [77, 159], [-40, 240]); // far past the bottom-left corner of the page
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled(); // it did move…
    await expect(page.getByTestId("print-check")).toContainText("Ready to print"); // …but stayed inside
  });

  test("resizing stops at the edge too", async ({ page, isMobile }) => {
    test.skip(isMobile, "transformer handles are small targets for synthetic touches");
    await openRaceTemplate(page);
    await selectName(page);
    // The name box is x 8–140 mm; its right-middle handle sits at x 143, y 159 (page mm).
    await drag(page, [143, 159], [200, 159]);
    await expect(page.getByTestId("print-check")).toContainText("Ready to print");
  });

  test("touch can resize text inward and respects the safe area", async ({
    page,
    context,
    browserName,
    isMobile,
  }) => {
    test.skip(!isMobile || browserName !== "chromium", "Uses Chromium touch emulation");
    await openRaceTemplate(page);
    const name = await canvasPoint(page, 77, 159);
    await page.evaluate((y) => window.scrollBy(0, Math.max(0, y - 220)), name.y);
    const center = await canvasPoint(page, 77, 159);
    await page.touchscreen.tap(center.x, center.y);
    const field = page.getByTestId("element-width");
    await expect(field).toBeVisible();
    const dimension = async (key: string) =>
      Number.parseFloat(await page.getByTestId(key).innerText());
    const x = await dimension("element-x");
    const initial = await dimension("element-width");
    const session = await context.newCDPSession(page);
    const resize = async (target: number) => {
      const handle = x + (await dimension("element-width")) + 3;
      const from = await canvasPoint(page, handle, 159);
      const to = await canvasPoint(page, target, 159);
      expect(
        await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, from),
      ).toBe("CANVAS");
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
      for (let step = 1; step <= 12; step++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: from.x + ((to.x - from.x) * step) / 12, y: from.y }],
        });
      }
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    try {
      await resize(110);
      await expect.poll(() => dimension("element-width")).toBeLessThan(initial - 10);
      const narrowed = await dimension("element-width");
      await resize(175);
      await expect.poll(() => dimension("element-width")).toBeGreaterThan(narrowed + 10);
      // The template's A5 trim is 148 mm wide and has a 3 mm text safety margin.
      expect(x + (await dimension("element-width"))).toBeLessThanOrEqual(145.01);
      await expect(page.getByTestId("print-check")).toContainText("Ready to print");
    } finally {
      await session.detach();
    }
  });

  test("a burst of typing is undone in one step", async ({ page }) => {
    await openRaceTemplate(page);
    await selectName(page);
    const field = page.getByLabel("Text", { exact: true });
    await field.fill("");
    await field.pressSequentially("PRIYA SHAH", { delay: 20 });
    await expect(field).toHaveValue("PRIYA SHAH");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(field).toHaveValue("ALEX MORGAN");
  });

  test("on phones the element panel opens as a bottom sheet", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout only");
    await openRaceTemplate(page);
    await selectName(page);
    const sheet = page.getByTestId("selected-panel");
    await expect(sheet).toHaveCSS("position", "fixed");
    await expect(sheet.getByLabel("Text", { exact: true })).toBeInViewport();
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("element-panel")).toHaveCount(0);
    await expect(sheet).not.toHaveCSS("position", "fixed");
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
    isMobile,
  }) => {
    test.skip(isMobile, "account flow does not depend on the viewport");
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
    // Next keeps the previous route mounted but hidden for a moment; check the visible one.
    // Either the moment of saving ("Saved 14:05") or, once reloaded, the resting state.
    await expect(page.getByTestId("save-status").filter({ visible: true })).toHaveText(
      /^(Saved \d{2}:\d{2}|All changes saved)$/,
    );

    await page.goto("/account/designs");
    await page.getByRole("link", { name: `E2E bib ${name}` }).click();
    await expect(page.getByTestId("print-check")).toContainText("Ready to print");
    await selectName(page);
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(name);
  });

  test("a design can only be opened by its owner", async ({ page, browser, isMobile }) => {
    test.skip(isMobile, "access rules do not depend on the viewport");
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
