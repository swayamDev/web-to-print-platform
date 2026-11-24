import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

import { admin, approvedOrder, createQuoteOrder, local, logIn, payOrder } from "./support/orders";

/**
 * Customer dashboard (PRD p7 §09): invoices, one-click reorder (DECISIONS D-12) and order
 * tracking by stage.
 */

test.describe("customer dashboard", () => {
  test.skip(({ isMobile }) => isMobile, "account flows do not depend on the viewport");
  test.skip(!local, "needs signed test webhooks and the secret key for setup");

  test("a paid order has a downloadable invoice; unpaid orders and strangers get nothing", async ({
    page,
    request,
  }) => {
    const order = await createQuoteOrder();
    // Anonymous and before payment: not found.
    expect((await request.get(`/api/v1/invoices/${order.id}`)).status()).toBe(404);
    await logIn(page);
    expect((await page.request.get(`/api/v1/invoices/${order.id}`)).status()).toBe(404);

    await payOrder(request, order);
    const { data } = await admin()
      .from("orders")
      .select("invoice_number")
      .eq("id", order.id)
      .single();
    const invoiceNumber = data!.invoice_number!;

    await page.goto(`/account/orders/${order.id}`);
    const download = page.waitForEvent("download");
    await page.getByTestId("invoice-link").click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`${invoiceNumber}_${order.order_number}.pdf`);

    const response = await page.request.get(`/api/v1/invoices/${order.id}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    const bytes = await response.body();
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe(`VAT invoice ${invoiceNumber}`);
    // The same invoice always gives the same file.
    const again = await page.request.get(`/api/v1/invoices/${order.id}`);
    expect(Buffer.compare(await again.body(), bytes)).toBe(0);

    // The order list links the invoice too.
    await page.goto("/account/orders");
    await expect(page.getByRole("link", { name: `Invoice ${invoiceNumber}` })).toBeVisible();
  });

  test("an approved order is reordered at today's price and approved without a new proof wait", async ({
    page,
    request,
  }) => {
    test.skip(!process.env.STRIPE_SECRET_KEY, "opening Stripe Checkout needs a test key");
    const { order, proof } = await approvedOrder(request);
    await logIn(page);

    // The dashboard offers it under "Order again".
    await expect(page.getByTestId("order-again")).toContainText(order.order_number);
    await page.goto(`/account/orders/${order.id}`);
    const section = page.getByTestId("reorder-section");
    await expect(section).toContainText("today’s price");
    const button = section.getByRole("button", { name: /^Reorder for £/ });
    await expect(button).toBeDisabled(); // the artwork confirmation comes first
    await section.getByRole("checkbox").check();
    await button.click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

    // The new order is linked to the original and carries the customer's confirmation.
    const db = admin();
    const { data: reorder } = await db
      .from("orders")
      .select(
        "id, order_number, checkout_session_id, total_gross_minor, status, reorder_confirmation",
      )
      .eq("reorder_of_order_id", order.id)
      .single();
    expect(reorder!.status).toBe("quote");
    expect(reorder!.reorder_confirmation).toMatchObject({ sourceProofHash: proof.snapshot_hash });

    await payOrder(request, { ...reorder!, total: reorder!.total_gross_minor });
    await expect
      .poll(
        async () => {
          const { data } = await db
            .from("orders")
            .select("approved_proof_id")
            .eq("id", reorder!.id)
            .single();
          return Boolean(data?.approved_proof_id);
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    const { data: versions } = await db
      .from("proof_versions")
      .select("source, status, snapshot_hash, proof_events(action)")
      .eq("order_id", reorder!.id);
    expect(versions).toEqual([
      {
        source: "reorder",
        status: "approved",
        snapshot_hash: proof.snapshot_hash,
        proof_events: [{ action: "approved_via_reorder" }],
      },
    ]);

    await page.goto(`/account/orders/${reorder!.id}`);
    await expect(page.getByTestId("reorder-of")).toContainText(order.order_number);
    await expect(page.getByTestId("proof-approved")).toContainText("Approved through your reorder");
    await expect(page.getByTestId("order-status")).toHaveText("Proof approved");
  });

  test("the reorder button needs the artwork confirmation", async ({ page, request }) => {
    const { order } = await approvedOrder(request);
    await logIn(page);
    await page.goto(`/account/orders/${order.id}#reorder`);
    const section = page.getByTestId("reorder-section");
    await expect(section.getByRole("button", { name: /^Reorder for/ })).toBeDisabled();
    // Orders without an approved proof offer no reorder at all.
    const unpaid = await createQuoteOrder();
    await page.goto(`/account/orders/${unpaid.id}`);
    await expect(page.getByTestId("order-status")).toHaveText("Awaiting payment");
    await expect(page.getByTestId("reorder-section")).toHaveCount(0);
  });

  test("the dashboard counts orders by stage and the list filters by them", async ({ page }) => {
    const unpaid = await createQuoteOrder();
    await logIn(page);
    await expect(page.getByTestId("order-summary")).toContainText("Awaiting payment");
    await page
      .getByTestId("order-summary")
      .getByRole("link", { name: /Awaiting payment/ })
      .click();
    await expect(page).toHaveURL(/\/account\/orders\?show=unpaid$/);
    await expect(page.getByRole("link", { name: "Awaiting payment", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("order-list")).toContainText(unpaid.order_number);
    await page.getByRole("link", { name: "Completed", exact: true }).click();
    await expect(page).toHaveURL(/show=completed$/);
    // Next keeps the previous route mounted but hidden for a moment; check the visible list.
    await expect(page.getByText(unpaid.order_number).filter({ visible: true })).toHaveCount(0);
  });
});
