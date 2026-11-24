import { expect, test } from "@playwright/test";
import { PDFDocument, rgb } from "pdf-lib";

import {
  admin,
  adminUser,
  approvedOrder,
  createQuoteOrder,
  createStickerDesign,
  customer,
  local,
  logIn,
  mailCount,
  payOrder,
} from "./support/orders";

/**
 * Admin console (PRD p4 §03, p8 §11–12, p10 §16 "admin pipeline"): the order queue with
 * filters and search, pipeline actions, corrected proofs uploaded by staff, and users.
 */

const MM = 72 / 25.4;

/** A full-bleed 54 × 54 mm PDF: the 50 mm sticker plus 2 mm bleed on each side. */
async function correctedArtwork() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([54 * MM, 54 * MM]);
  page.drawRectangle({ x: 0, y: 0, width: 54 * MM, height: 54 * MM, color: rgb(0.1, 0.5, 0.3) });
  return Buffer.from(await pdf.save());
}

/** Move an approved order into production directly (print rendering is covered elsewhere). */
async function inProduction(request: Parameters<typeof approvedOrder>[0]) {
  const { order, proof } = await approvedOrder(request);
  const db = admin();
  await db.from("production_files").insert({
    order_id: order.id,
    proof_version_id: proof.id,
    kind: "pdf",
    storage_path: `${order.order_number}/${order.order_number}_custom-stickers_test_print.pdf`,
  });
  const { error } = await db.rpc("start_production", { p_order_id: order.id });
  if (error) throw error;
  return order;
}

test.describe("admin console", () => {
  test.skip(({ isMobile }) => isMobile, "admin workflow; covered on desktop");
  test.skip(!local, "needs the secret key and signed webhooks for setup");

  test("the queue filters by stage and finds orders by number or customer email", async ({
    page,
  }) => {
    const order = await createQuoteOrder();
    await logIn(page, adminUser);
    await page.goto("/admin");
    await page.getByRole("link", { name: /Awaiting payment/ }).click();
    await expect(page).toHaveURL(/\/admin\/orders\?status=quote$/);
    await expect(page.getByTestId("admin-order-list")).toContainText(order.order_number);

    await page.getByLabel("Search orders").fill(order.order_number);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByTestId("queue-count")).toHaveText(
      `1 order matching “${order.order_number}”`,
    );

    await page.goto(`/admin/orders?q=${encodeURIComponent(customer.email)}`);
    await expect(page.getByTestId("admin-order-list")).toContainText(order.order_number);
    await page.goto("/admin/orders?q=nobody-at-all@example.invalid");
    await expect(page.getByText("No orders match these filters.")).toBeVisible();
  });

  test("customers cannot open the admin console", async ({ page }) => {
    await logIn(page);
    for (const path of ["/admin/orders", "/admin/users"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    }
  });

  test("an admin completes a job, the customer is told, and it can be archived", async ({
    page,
    request,
  }) => {
    const order = await inProduction(request);
    await logIn(page, adminUser);
    await page.goto(`/admin/orders/${order.id}`);
    const actions = page.getByTestId("pipeline-actions");
    await actions.getByRole("button", { name: "Mark complete" }).click();
    await expect(actions.getByTestId("admin-action-result")).toContainText("Marked complete");
    await expect(page.getByTestId("admin-order-status")).toHaveText("Completed");
    await expect(page.getByTestId("admin-timeline")).toContainText("Completed");
    await expect
      .poll(() => mailCount(request, `Order ${order.order_number} is complete`), {
        timeout: 15_000,
      })
      .toBe(1);

    await actions.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("Completed · archived");
    await expect(page.getByTestId("admin-audit")).toContainText("Marked complete");
    await expect(page.getByTestId("admin-audit")).toContainText("Archived");
    // Archived orders leave the active queue but stay findable.
    await page.goto(`/admin/orders?q=${order.order_number}`);
    await expect(page.getByTestId("queue-count")).toContainText("0 orders");
    await page.goto(`/admin/orders?view=archived&q=${order.order_number}`);
    await expect(page.getByTestId("admin-order-list")).toContainText(order.order_number);
  });

  test("cancelling needs a reason, which is sent to the customer", async ({ page, request }) => {
    const order = await createQuoteOrder();
    await logIn(page, adminUser);
    await page.goto(`/admin/orders/${order.id}`);
    const actions = page.getByTestId("pipeline-actions");
    await actions.getByRole("button", { name: "Cancel order…" }).click();
    const confirm = actions.getByRole("button", { name: "Cancel this order" });
    await expect(confirm).toBeDisabled();
    await actions.getByLabel("Reason (sent to the customer)").fill("Duplicate order");
    await confirm.click();
    await expect(page.getByTestId("admin-order-status")).toHaveText("Cancelled");
    await expect(page.getByTestId("admin-timeline")).toContainText("Duplicate order");
    await expect
      .poll(() => mailCount(request, `Order ${order.order_number} cancelled`), {
        timeout: 15_000,
      })
      .toBe(1);
  });

  test("staff upload corrected artwork as the next proof for the customer to approve", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000); // payment, proof v1, then a second render
    const design = await createStickerDesign("NEEDS FIXING");
    const order = await createQuoteOrder(1620, design);
    await payOrder(request, order);
    const db = admin();
    await expect
      .poll(
        async () =>
          (await db.from("proof_versions").select("id").eq("order_id", order.id)).data?.length,
        { timeout: 60_000 },
      )
      .toBe(1);

    await logIn(page, adminUser);
    await page.goto(`/admin/orders/${order.id}`);
    const upload = page.getByTestId("admin-proof-upload");
    await upload.getByLabel(/Corrected artwork/).setInputFiles({
      name: "fixed.pdf",
      mimeType: "application/pdf",
      buffer: await correctedArtwork(),
    });
    await upload.getByLabel(/Note for the audit log/).fill("Moved the logo inside the safe area");
    await upload.getByRole("button", { name: "Create proof from this file" }).click();
    await expect(upload.getByTestId("admin-action-result")).toContainText("Proof v2 created", {
      timeout: 60_000,
    });
    await expect(page.getByTestId("admin-proof-history")).toContainText("v2");
    await expect(page.getByTestId("admin-proof-history")).toContainText("uploaded by staff");
    await expect(page.getByTestId("admin-audit")).toContainText(
      "Corrected proof uploaded — Moved the logo inside the safe area",
    );

    const { data: versions } = await db
      .from("proof_versions")
      .select("version, source, status")
      .eq("order_id", order.id)
      .order("version");
    expect(versions).toEqual([
      { version: 1, source: "customer_edit", status: "superseded" },
      { version: 2, source: "admin_upload", status: "pending" },
    ]);
    // The customer sees v2 waiting for their decision.
    const { data: item } = await db
      .from("order_items")
      .select("design_snapshot")
      .eq("order_id", order.id)
      .single();
    expect(
      (item!.design_snapshot as { elements: { role?: string }[] }).elements.map((e) => e.role),
    ).toEqual(["artwork"]);
  });

  test("users are searchable and roles change with an audit trail", async ({ page }) => {
    const db = admin();
    const email = `role-${Date.now()}@test.local`;
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password: `pw-${Date.now()}-x`,
      email_confirm: true,
      user_metadata: { full_name: "Role Tester" },
    });
    if (error) throw error;

    await logIn(page, adminUser);
    await page.goto("/admin/users");
    await page.getByLabel("Search users").fill(email);
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByTestId("admin-user-list").getByText(email).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const role = page.getByTestId("user-role");
    page.once("dialog", (d) => d.accept());
    await role.getByRole("button", { name: "Make admin" }).click();
    await expect(role).toContainText("Admin: can see every order");
    await expect(role).toContainText("customer → admin");
    page.once("dialog", (d) => d.accept());
    await role.getByRole("button", { name: "Make customer" }).click();
    await expect(role).toContainText("Customer: sees only their own orders");

    // Admins cannot change their own role from the console.
    const { data: me } = await db.auth.admin.listUsers({ perPage: 200 });
    const adminId = me.users.find((u) => u.email === adminUser.email)!.id;
    await page.goto(`/admin/users/${adminId}`);
    await expect(page.getByTestId("user-role")).toContainText("You cannot change your own role.");

    await db.auth.admin.deleteUser(created.user.id);
  });
});
