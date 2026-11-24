import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";

import { canonicalJson } from "../src/domain/canonical";

import { admin, adminUser, customerId, local, logIn, mailCount, payOrder } from "./support/orders";

/**
 * CSV variable-data merge (PRD p6 §07, p10 §16 "Print-file & CSV merge output"): upload and
 * map a CSV in the designer, row preflight, an all-rows proof, and one print file per row
 * rendered on the server in batches, plus the combined PDF and a ZIP.
 */

const csv = (rows: string[][]) =>
  Buffer.from(["Bib Number,Full Name", ...rows.map((r) => r.join(","))].join("\n"));
const NAMES = [
  "PRIYA SHAH",
  "SAM LEE",
  "ANA COSTA",
  "BEN OKAFOR",
  "MIA NOVAK",
  "LEO MARTIN",
  "ZOE KIM",
  "OMAR ALI",
  "EVA ROSS",
  "IAN PRICE",
  "JO WEST",
  "KAI REED",
];
const GOOD = NAMES.map((name, i) => [String(101 + i), name]);

async function openRaceTemplateWithData(page: Page) {
  await page.goto("/p/race-numbers");
  await page.getByLabel("Different name and number on every item").check();
  await page.getByRole("link", { name: "Design online" }).click();
  await expect(page).toHaveURL(/\/design\/new\?.*product=race-numbers.*vd=1/);
  await expect(page.getByTestId("data-merge")).toBeVisible();
  // The print check only completes in the browser: the designer is live from here on.
  await expect(page.getByTestId("print-check")).toContainText("Ready to print");
}

test.describe("CSV merge", () => {
  test.skip(({ isMobile }) => isMobile, "covered on desktop");
  test.skip(!local, "needs the secret key and signed test webhooks");

  test("the designer reads, maps and checks every row, and keeps the file with the design", async ({
    page,
  }) => {
    await logIn(page);
    await openRaceTemplateWithData(page);
    await expect(page.getByRole("button", { name: "Order now" })).toBeDisabled();

    await page
      .getByTestId("csv-input")
      .setInputFiles({ name: "entries.csv", mimeType: "text/csv", buffer: csv(GOOD) });
    await expect(page.getByTestId("csv-summary")).toHaveText("entries.csv · 12 rows");
    // Columns are matched by name and common synonyms.
    await expect(page.getByLabel("Column for BIB")).toHaveValue("Bib Number");
    await expect(page.getByLabel("Column for NAME")).toHaveValue("Full Name");
    await expect(page.getByTestId("merge-check")).toContainText("All 12 rows are ready to print");
    await expect(page.getByTestId("preview-row")).toHaveText("Showing row 1 of 12");
    await page.getByRole("button", { name: "Next row" }).click();
    await expect(page.getByTestId("preview-row")).toHaveText("Showing row 2 of 12");
    // One item per row.
    await expect(page.getByLabel("Order summary")).toContainText("12 items (one per row)");

    // Saved with the design, and back after a reload.
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/design\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("save-status")).toContainText(/Saved|All changes saved/);
    await page.reload();
    await expect(page.getByTestId("csv-summary")).toHaveText("entries.csv · 12 rows");
    // Wait for the designer to run in the browser (fonts loaded, checks live) before uploading.
    await expect(page.getByTestId("merge-check")).toContainText("All 12 rows are ready to print");
    await expect(page.getByLabel("Column for NAME")).toHaveValue("Full Name");

    // Problems are listed per row and block ordering.
    const bad = [...GOOD.slice(0, 9), ["110", ""], ["101", "DUPLICATE BIB"], ["112", "田中"]];
    await page
      .getByTestId("csv-input")
      .setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: csv(bad) });
    const check = page.getByTestId("merge-check");
    await expect(check).toContainText("problems to fix before ordering");
    await expect(check).toContainText("Row 10: {NAME} is empty.");
    await expect(check).toContainText('Row 11: {BIB} "101" is the same as row 1.');
    await expect(check).toContainText(/Row 12 \{NAME\}:/);
    await expect(page.getByRole("button", { name: "Order now" })).toBeDisabled();

    // Files over the row cap are refused with a clear message.
    const tooMany = Array.from({ length: 101 }, (_, i) => [String(i + 1), `RIDER ${i + 1}`]);
    await page
      .getByTestId("csv-input")
      .setInputFiles({ name: "big.csv", mimeType: "text/csv", buffer: csv(tooMany) });
    await expect(page.getByTestId("csv-error")).toContainText("101 rows; the maximum is 100");
  });

  test("a paid CSV order gets an all-rows proof and one print file per row", async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const db = admin();
    const owner = await customerId();
    const { data: product } = await db
      .from("products")
      .select("id")
      .eq("slug", "race-numbers")
      .single();
    const { data: template } = await db
      .from("templates")
      .select("document")
      .eq("product_id", product!.id)
      .limit(1)
      .single();
    const rows = GOOD.map(([bib, name]) => ({ BIB: bib!, NAME: name! }));
    const dataset = createHash("sha256")
      .update(canonicalJson({ v: 1, rows }))
      .digest("hex");

    // The order exactly as checkout leaves it: one item per row, rows frozen in a merge job.
    const { data: asset } = await db
      .from("assets")
      .insert({
        owner_id: owner,
        path: `${owner}/${crypto.randomUUID()}.csv`,
        kind: "csv",
        status: "valid",
        original_filename: "entries.csv",
      })
      .select("id")
      .single();
    const { data: order, error } = await db
      .from("orders")
      .insert({
        customer_id: owner,
        currency: "GBP",
        subtotal_net_minor: 1000,
        tax_rate: 0.2,
        tax_minor: 200,
        total_gross_minor: 1200,
        pricing_snapshot: {},
        payment_provider: "stripe",
        checkout_session_id: `cs_test_${Date.now()}`,
      })
      .select("id, order_number, checkout_session_id")
      .single();
    if (error) throw error;
    await db.from("order_items").insert({
      order_id: order.id,
      product_id: product!.id,
      description: "Race Numbers × 12 (148 × 210 mm, Tyvek, personalised from CSV)",
      config_snapshot: {
        widthMm: 148,
        heightMm: 210,
        materialSlug: "tyvek",
        quantity: 12,
        options: {},
        variableData: true,
      },
      design_snapshot: template!.document,
      quantity: 12,
      unit_net: 0.8,
      line_net_minor: 1000,
      line_tax_minor: 200,
      line_gross_minor: 1200,
      is_variable_data: true,
    });
    await db.from("merge_jobs").insert({
      order_id: order.id,
      csv_asset_id: asset!.id,
      mapping: { BIB: "Bib Number", NAME: "Full Name" },
      rows,
      row_count: 12,
      dataset_hash: dataset,
    });

    await payOrder(request, { ...order, total: 1200 });
    let proof: {
      id: string;
      proof_pdf_path: string | null;
      merge_dataset_hash: string | null;
    } | null = null;
    await expect
      .poll(
        async () => {
          const { data } = await db
            .from("proof_versions")
            .select("id, proof_pdf_path, merge_dataset_hash")
            .eq("order_id", order.id)
            .maybeSingle();
          proof = data;
          return Boolean(data);
        },
        { timeout: 90_000 },
      )
      .toBe(true);
    expect(proof!.merge_dataset_hash).toBe(dataset);

    // The proof PDF has one page per row.
    const proofPdf = await db.storage.from("proofs").download(proof!.proof_pdf_path!);
    const proofDoc = await PDFDocument.load(new Uint8Array(await proofPdf.data!.arrayBuffer()));
    expect(proofDoc.getPageCount()).toBe(12);

    await logIn(page);
    await page.goto(`/account/orders/${order.id}`);
    await expect(page.getByTestId("proof-rows")).toContainText("12 items");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Approve proof v1" }).click();
    await expect(page.getByTestId("proof-approved")).toBeVisible();

    // Production, in batches of rows.
    const adminPage = await page.context().browser()!.newPage();
    await logIn(adminPage, adminUser);
    await adminPage.goto(`/admin/orders/${order.id}`);
    await adminPage
      .getByRole("button", { name: "Generate print files and start production" })
      .click();
    await expect(adminPage.getByTestId("production-result")).toHaveText(
      "Print files generated. The order is now in production.",
      { timeout: 150_000 },
    );

    const { data: files } = await db
      .from("production_files")
      .select("id, kind, row_index, storage_path, width_px, dpi")
      .eq("order_id", order.id);
    const count = (kind: string) => files!.filter((f) => f.kind === kind).length;
    expect([count("row_pdf"), count("row_png"), count("pdf"), count("zip")]).toEqual([
      12, 12, 1, 1,
    ]);
    expect(files!.find((f) => f.kind === "row_png" && f.row_index === 7)).toMatchObject({
      storage_path: expect.stringMatching(
        new RegExp(
          `^${order.order_number}/rows/${order.order_number}_race-numbers_\\d{4}-\\d{2}-\\d{2}_row-007\\.png$`,
        ),
      ),
      width_px: 1819, // 154 mm at 300 DPI
      dpi: 300,
    });

    // The combined print PDF has 12 pages; the ZIP holds all 24 row files.
    const get = async (kind: string) => {
      const file = files!.find((f) => f.kind === kind)!;
      const r = await adminPage.request.get(`/api/v1/admin/production-files/${file.id}`, {
        maxRedirects: 0,
      });
      expect(r.status()).toBe(303);
      return new Uint8Array(await (await adminPage.request.get(r.headers().location!)).body());
    };
    expect((await PDFDocument.load(await get("pdf"))).getPageCount()).toBe(12);
    const entries = Object.keys(unzipSync(await get("zip"))).sort();
    expect(entries).toHaveLength(24);
    expect(entries[0]).toMatch(/_row-001\.pdf$/);
    expect(entries[23]).toMatch(/_row-012\.png$/);

    const { data: job } = await db
      .from("merge_jobs")
      .select("status, processed_count, zip_path")
      .eq("order_id", order.id)
      .single();
    expect(job).toMatchObject({ status: "done", processed_count: 12 });
    await expect(adminPage.getByTestId("admin-order-status")).toHaveText("In production");
    await adminPage.close();

    await expect
      .poll(() => mailCount(request, `Order ${order.order_number} is in production`), {
        timeout: 15_000,
      })
      .toBe(1);
  });
});
