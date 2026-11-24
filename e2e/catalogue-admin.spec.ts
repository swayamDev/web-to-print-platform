import { expect, test } from "@playwright/test";

import { admin, adminUser, createQuoteOrder, local, logIn, payOrder } from "./support/orders";

/**
 * Catalogue management, reports and the Xero export (PRD p4 §03, p9 §14). Edits use the
 * laser-cut sign, which no other spec prices, and are undone afterwards.
 */

const SLUG = "laser-cut-signs";
const SIGN = {
  productSlug: SLUG,
  widthMm: 300,
  heightMm: 200,
  materialSlug: "acrylic-clear-3",
  quantity: 1,
};

/** Snapshot the product with its materials and tiers; returns a function that restores it. */
async function snapshotProduct() {
  const db = admin();
  const { data: product } = await db.from("products").select("*").eq("slug", SLUG).single();
  const [{ data: materials }, { data: tiers }, { data: templates }] = await Promise.all([
    db.from("product_materials").select("*").eq("product_id", product!.id),
    db
      .from("discount_tiers")
      .select("product_id, min_qty, percent_off")
      .eq("product_id", product!.id),
    db.from("templates").select("*").eq("product_id", product!.id),
  ]);
  return {
    product: product!,
    restore: async () => {
      await db.from("products").update(product!).eq("id", product!.id);
      await db.from("product_materials").delete().eq("product_id", product!.id);
      await db.from("product_materials").insert(materials!);
      await db.from("discount_tiers").delete().eq("product_id", product!.id);
      if (tiers!.length) await db.from("discount_tiers").insert(tiers!);
      for (const t of templates!) await db.from("templates").update(t).eq("id", t.id);
    },
  };
}

test.describe("catalogue admin", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "admin workflow; covered on desktop");
  test.skip(!local, "edits the catalogue; local only");

  test("an admin changes prices and the storefront quotes them at once", async ({
    page,
    request,
  }) => {
    const { product, restore } = await snapshotProduct();
    try {
      const before = await (await request.post("/api/v1/price", { data: SIGN })).json();
      expect(before.quote.unit.base).toBe("2");

      await logIn(page, adminUser);
      await page.goto("/admin/products");
      await page.getByRole("link", { name: /Laser-Cut Signs/ }).click();
      const form = page.locator('[data-testid="product-form"][data-hydrated]');
      await expect(form).toBeVisible();

      // Inconsistent limits are refused with a clear message, and nothing is saved.
      await form.getByLabel("Max width (mm)").fill("10");
      await form.getByRole("button", { name: "Save product" }).click();
      await expect(form.getByTestId("save-result")).toHaveText(
        "Maximum width is below the minimum",
      );
      await form.getByLabel("Max width (mm)").fill(String(product.max_width_mm));

      await form.getByLabel(/Base price per item/).fill("2.50");
      await form.getByRole("button", { name: "Add a tier" }).click();
      await form.getByTestId("tiers").getByLabel("From quantity").fill("5");
      await form.getByTestId("tiers").getByLabel("Discount %").fill("10");
      await form.getByRole("button", { name: "Save product" }).click();
      await expect(form.getByTestId("save-result")).toContainText("Saved.");
      await expect(page.getByTestId("product-history")).toContainText("base unit price 2 → 2.5");
      await expect(page.getByTestId("product-history")).toContainText("discount tiers");

      // The public price API sees the new rules straight away (the catalogue cache was expired).
      const after = await (await request.post("/api/v1/price", { data: SIGN })).json();
      expect(after.quote.unit.base).toBe("2.5");
      const five = await (
        await request.post("/api/v1/price", { data: { ...SIGN, quantity: 5 } })
      ).json();
      expect(five.quote.tier).toEqual({ minQty: 5, percentOff: "10" });
    } finally {
      await restore();
    }
  });

  test("hiding a template removes it from the shop", async ({ page }) => {
    const { restore } = await snapshotProduct();
    try {
      await logIn(page, adminUser);
      await page.goto("/admin/templates");
      const row = page
        .getByRole("region", { name: "Laser-Cut Signs" })
        .locator("form[data-hydrated]")
        .first();
      await expect(row).toBeVisible();
      await row.getByLabel("Group").fill("Home");
      await row.getByLabel("Shown to customers").uncheck();
      await row.getByRole("button", { name: "Save" }).click();
      await expect(row.getByTestId("save-result")).toContainText("Customers no longer see it");

      await page.goto(`/p/${SLUG}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText("House Sign")).toHaveCount(0);
    } finally {
      await restore();
    }
  });

  test("reports total the period and the Xero export contains its invoices", async ({
    page,
    request,
  }) => {
    const order = await createQuoteOrder();
    await payOrder(request, order);
    const { data: paid } = await admin()
      .from("orders")
      .select("invoice_number")
      .eq("id", order.id)
      .single();

    await logIn(page, adminUser);
    await page.goto("/admin/reports?period=month");
    await expect(page.getByTestId("report-period")).toContainText("This month");
    await expect(page.getByTestId("report-totals")).toContainText("Paid orders");
    await expect(page.getByTestId("by-division")).toContainText("Labels & Stickers");

    const href = await page.getByTestId("xero-export").getAttribute("href");
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    const csv = (await response.text()).replace(/^﻿/, "");
    const [header, ...lines] = csv.trim().split("\r\n");
    expect(header!.split(",").slice(0, 2)).toEqual(["*ContactName", "EmailAddress"]);
    const line = lines.find((l) => l.includes(paid!.invoice_number!));
    expect(line, "the new invoice is exported").toBeTruthy();
    expect(line).toContain(order.order_number);
    // The test order records no discount %, so 100 × £0.15 would not give its £13.50 line:
    // the export uses one net line instead, keeping the totals exact.
    expect(line).toContain(",1,13.50,,200,20% (VAT on Income),2.70,Division,Labels & Stickers,");

    const { data: audit } = await admin()
      .from("audit_logs")
      .select("action")
      .eq("action", "export.xero")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(audit).toHaveLength(1);
  });

  test("customers cannot reach the catalogue admin or the export", async ({ page }) => {
    await logIn(page);
    for (const path of ["/admin/products", "/admin/templates", "/admin/reports"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    }
    expect((await page.request.get("/api/v1/admin/exports/xero?period=month")).status()).toBe(404);
  });
});
