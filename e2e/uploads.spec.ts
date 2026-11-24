import { Resvg } from "@resvg/resvg-js";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, rgb } from "pdf-lib";

/**
 * Artwork uploads (PRD p5 §06: "customers may upload finished artwork: PDF, SVG, AI, PNG"),
 * through the real designer, storage and server checks. Test files are generated here.
 */

const customer = {
  email: process.env.TEST_CUSTOMER_EMAIL ?? "",
  password: process.env.TEST_CUSTOMER_PASSWORD ?? "",
};
const MM = 72 / 25.4;

const pngOf = (size: number, color: string) =>
  Buffer.from(
    new Resvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="${color}"/><circle cx="5" cy="5" r="3" fill="#fff"/></svg>`,
      { fitTo: { mode: "width", value: size } },
    )
      .render()
      .asPng(),
  );

async function pdfOf(widthMm: number, heightMm: number) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([widthMm * MM, heightMm * MM]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: widthMm * MM,
    height: heightMm * MM,
    color: rgb(0.1, 0.4, 0.9),
  });
  return Buffer.from(await pdf.save());
}

const files = {
  logo: async () => ({ name: "logo.png", mimeType: "image/png", buffer: pngOf(800, "#c62828") }),
  tiny: async () => ({ name: "tiny.png", mimeType: "image/png", buffer: pngOf(40, "#1f8a4c") }),
  svg: async () => ({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10" fill="#3b5bdb"/></svg>',
    ),
  }),
  evilSvg: async () => ({
    name: "evil.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>',
    ),
  }),
  fakePng: async () => ({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from("definitely not an image"),
  }),
  legacyAi: async () => ({
    name: "logo.ai",
    mimeType: "application/postscript",
    buffer: Buffer.from("%!PS-Adobe-3.0\n%%Creator: Adobe Illustrator(R) 8.0\n%%EOF\n"),
  }),
  bibWithBleed: async () => ({
    name: "bib.pdf",
    mimeType: "application/pdf",
    buffer: await pdfOf(154, 216),
  }),
  bibNoBleed: async () => ({
    name: "bib-trim.pdf",
    mimeType: "application/pdf",
    buffer: await pdfOf(148, 210),
  }),
};

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(customer.email);
  await page.getByLabel("Password").fill(customer.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function openDesigner(page: Page, productSlug: string) {
  await page.goto(`/p/${productSlug}`);
  await page.getByRole("link", { name: "Design online" }).click();
  await expect(page.getByTestId("print-check")).toContainText("Ready to print");
}

/** Click a toolbar button that opens the file picker, and choose a file. */
async function choose(
  page: Page,
  button: RegExp,
  file: Awaited<ReturnType<(typeof files)["logo"]>>,
) {
  const chooser = page.waitForEvent("filechooser");
  // The toolbar button (the element panel can show a button with the same name).
  await page.getByRole("button", { name: button }).first().click();
  await (await chooser).setFiles(file);
}

test.describe("uploads", () => {
  test.skip(({ isMobile }) => isMobile, "uploads do not depend on the viewport");

  test("a logo fills the template's logo slot and is saved with the design", async ({ page }) => {
    await logIn(page);
    await openDesigner(page, "custom-stickers"); // "Logo & Name" template with a logo slot

    // Select the logo slot (trim x 12–38, y 6–32 mm; 2 mm bleed; page 54 mm square).
    const canvas = page.getByTestId("design-canvas").locator("canvas").first();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + (27 / 54) * box.width, box.y + (21 / 54) * box.height);
    await expect(page.getByTestId("image-info")).toContainText("Logo slot");

    await choose(page, /Add image|Replace image/, await files.logo());
    await expect(page.getByTestId("image-info")).toContainText("800 × 800 px");
    // 800 px across a 26 mm slot ≈ 781 DPI
    await expect(page.getByTestId("image-dpi")).toContainText("DPI at this size");
    await expect(page.getByTestId("print-check")).toContainText("Ready to print");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/design\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("save-status")).toContainText("Saved");

    await page.reload();
    await expect(page.getByTestId("print-check")).toContainText("Ready to print");
    const after = (await canvas.boundingBox())!;
    await page.mouse.click(after.x + (27 / 54) * after.width, after.y + (21 / 54) * after.height);
    await expect(page.getByTestId("image-info")).toContainText("800 × 800 px");
  });

  test("a tiny image is blocked as too low-resolution to print", async ({ page }) => {
    await logIn(page);
    await openDesigner(page, "race-numbers");
    await choose(page, /Add image/, await files.tiny());
    await expect(page.getByTestId("print-check")).toContainText("would print blurry");
  });

  test("SVG logos are accepted as vectors; unsafe SVGs are refused", async ({ page }) => {
    await logIn(page);
    await openDesigner(page, "race-numbers");
    await choose(page, /Add image/, await files.svg());
    await expect(page.getByTestId("image-info")).toContainText("SVG artwork: vector");

    await choose(page, /Replace image/, await files.evilSvg());
    await expect(page.getByTestId("upload-status")).toContainText("scripts are not accepted");
  });

  test("files are checked by their contents, not their names", async ({ page }) => {
    await logIn(page);
    await openDesigner(page, "race-numbers");
    await choose(page, /Add image/, await files.fakePng());
    await expect(page.getByTestId("upload-status")).toContainText("not a valid .png file");

    await choose(page, /Upload finished artwork/, await files.legacyAi());
    await expect(page.getByTestId("upload-status")).toContainText("Create PDF Compatible File");
  });

  test("finished PDF artwork with bleed covers the page and stays vector", async ({ page }) => {
    await logIn(page);
    await openDesigner(page, "race-numbers");
    await choose(page, /Upload finished artwork/, await files.bibWithBleed());
    await expect(page.getByTestId("image-info")).toContainText("PDF artwork: vector");
    await expect(page.getByTestId("upload-status")).toHaveCount(0); // no notes: size is right
    await expect(page.getByTestId("print-check")).toContainText("Ready to print");
  });

  test("PDF artwork without bleed is placed on the trim with an explanation", async ({ page }) => {
    await logIn(page);
    await openDesigner(page, "race-numbers");
    await choose(page, /Upload finished artwork/, await files.bibNoBleed());
    await expect(page.getByTestId("upload-status")).toContainText("no bleed");
  });

  test("visitors are asked to log in before uploading", async ({ page }) => {
    await openDesigner(page, "race-numbers");
    await page.getByRole("button", { name: "Add image" }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});
