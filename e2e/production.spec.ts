import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

import {
  admin,
  adminUser,
  approvedOrder,
  createQuoteOrder,
  createStickerDesign,
  local,
  logIn,
  mailCount,
  payOrder,
} from "./support/orders";

/**
 * Production files (PRD p6 §07, p7 §10, p10 §16): only after approval, rendered from the
 * approved snapshot, named OrderID_ProductType_Date_Output, admin-only downloads.
 */

test.describe("production files", () => {
  test.skip(({ isMobile }) => isMobile, "admin workflow; covered on desktop");
  test.skip(!local, "needs signed test webhooks and the secret key for setup");

  test("an admin generates print files from the approved proof and downloads them", async ({
    page,
    request,
  }) => {
    const { order, proof } = await approvedOrder(request);

    await logIn(page, adminUser);
    await page.goto("/admin/production");
    await expect(page.getByTestId("queue-ready")).toContainText(order.order_number);
    await page.getByRole("link", { name: order.order_number }).click();
    await expect(page.getByText(proof.snapshot_hash)).toBeVisible();

    await page.getByRole("button", { name: "Generate print files and start production" }).click();
    await expect(page.getByTestId("production-result")).toHaveText(
      "Print files generated. The order is now in production.",
    );
    await expect(page.getByTestId("admin-order-status")).toHaveText("In production");

    const db = admin();
    const { data: paid } = await db.from("orders").select("paid_at").eq("id", order.id).single();
    const date = new Date(paid!.paid_at!).toISOString().slice(0, 10);
    const base = `${order.order_number}/${order.order_number}_custom-stickers_${date}_print`;
    const { data: files } = await db
      .from("production_files")
      .select("id, kind, storage_path, sha256, width_px, height_px, dpi, proof_version_id")
      .eq("order_id", order.id)
      .order("kind");
    expect(files).toEqual([
      expect.objectContaining({
        kind: "pdf",
        storage_path: `${base}.pdf`,
        proof_version_id: proof.id,
      }),
      // 50 mm + 2 × 2 mm bleed at 300 DPI = 638 px
      expect.objectContaining({
        kind: "png",
        storage_path: `${base}.png`,
        width_px: 638,
        height_px: 638,
        dpi: 300,
      }),
    ]);

    // Download through the admin route: a short-lived signed link to the print PDF.
    const pdfFile = files!.find((f) => f.kind === "pdf")!;
    const redirect = await page.request.get(`/api/v1/admin/production-files/${pdfFile.id}`, {
      maxRedirects: 0,
    });
    expect(redirect.status()).toBe(303);
    const download = await page.request.get(redirect.headers().location!);
    const pdf = await PDFDocument.load(await download.body(), { updateMetadata: false });
    expect(pdf.getKeywords()).toContain(`sha256:${proof.snapshot_hash}`); // approved = printed
    expect(pdf.getPage(0).getTrimBox()).toMatchObject({ width: expect.closeTo(141.73, 1) }); // 50 mm

    const { count: downloads } = await db
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "production.downloaded")
      .eq("entity_id", pdfFile.id);
    expect(downloads).toBe(1);

    // Regenerating gives the same names and a byte-identical PDF.
    await page.getByRole("button", { name: "Regenerate print files" }).click();
    await expect(page.getByTestId("production-result")).toHaveText("Print files regenerated.");
    const { data: again } = await db
      .from("production_files")
      .select("sha256")
      .eq("order_id", order.id)
      .eq("kind", "pdf");
    expect(again).toEqual([{ sha256: pdfFile.sha256 }]);

    await expect
      .poll(() => mailCount(request, `Order ${order.order_number} is in production`), {
        timeout: 15_000,
      })
      .toBe(1);
  });

  test("customers can never reach production files", async ({ page, request }) => {
    const { order } = await approvedOrder(request);
    const db = admin();
    // Produce the files directly so this test does not depend on the admin UI.
    await logIn(page, adminUser);
    await page.goto(`/admin/orders/${order.id}`);
    await page.getByRole("button", { name: "Generate print files and start production" }).click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("In production");
    const { data: file } = await db
      .from("production_files")
      .select("id, storage_path")
      .eq("order_id", order.id)
      .eq("kind", "pdf")
      .single();

    const customerPage = await page.context().browser()!.newPage();
    await logIn(customerPage);
    const blocked = await customerPage.request.get(`/api/v1/admin/production-files/${file!.id}`, {
      maxRedirects: 0,
    });
    expect(blocked.status()).toBe(404);
    expect(
      (
        await request.get(`/api/v1/admin/production-files/${file!.id}`, { maxRedirects: 0 })
      ).status(),
    ).toBe(404);

    await customerPage.goto(`/account/orders/${order.id}`);
    await expect(customerPage.getByTestId("order-status")).toHaveText("In production");
    await expect(customerPage.getByText("_print.pdf")).toHaveCount(0);
    await customerPage.goto(`/admin/orders/${order.id}`);
    await expect(customerPage.getByText(/Error 404/)).toBeVisible();
    await customerPage.close();
  });

  test("print files stay locked until a proof is approved", async ({ page, request }) => {
    const design = await createStickerDesign("NOT YET");
    const order = await createQuoteOrder(1620, design);
    await payOrder(request, order);
    await logIn(page, adminUser);
    await page.goto(`/admin/orders/${order.id}`);
    await expect(page.getByText("Print files stay locked")).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate print files/ })).toHaveCount(0);
  });
});

test("the admin header fits a 360 px phone without sideways scrolling", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone layout only");
  test.skip(!adminUser.email, "admin test account not configured");
  await page.setViewportSize({ width: 360, height: 780 });
  await logIn(page, adminUser);
  for (const path of ["/admin", "/admin/orders", "/admin/production", "/admin/users", "/"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});
