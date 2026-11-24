import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

import {
  admin,
  createQuoteOrder,
  createStickerDesign,
  local,
  logIn,
  mailCount,
  payOrder,
  stickerDocument,
} from "./support/orders";

/**
 * Proofs and approval (PRD p6 §08, p10 §16): proof v1 after payment, change requests with a
 * comment, a revised version, approval with an audit log, and refusal of outdated approvals.
 */

async function waitForProof(orderId: string, version: number) {
  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from("proof_versions")
          .select("version")
          .eq("order_id", orderId)
          .eq("version", version);
        return data?.length ?? 0;
      },
      { timeout: 60_000, message: `proof v${version} should be generated` },
    )
    .toBe(1);
}

test.describe("proofs and approval", () => {
  test.skip(({ isMobile }) => isMobile, "covered on desktop; the proof UI is a single column");
  test.skip(!local, "needs signed test webhooks and the local mail catcher");

  test("payment creates a watermarked proof and a print-identical PDF", async ({ request }) => {
    const design = await createStickerDesign("HASH CHECK");
    const order = await createQuoteOrder(1620, design);
    await payOrder(request, order);
    await waitForProof(order.id, 1);

    const db = admin();
    const { data: proof } = await db
      .from("proof_versions")
      .select("status, snapshot_hash, proof_pdf_path, proof_png_path")
      .eq("order_id", order.id)
      .single();
    expect(proof).toMatchObject({ status: "pending" });
    expect(proof!.snapshot_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(proof!.proof_png_path).toMatch(new RegExp(`^${order.id}/v1/.+/proof\\.png$`));

    const { data: status } = await db.from("orders").select("status").eq("id", order.id).single();
    expect(status!.status).toBe("proof");

    const png = await db.storage.from("proofs").download(proof!.proof_png_path!);
    const pngBytes = Buffer.from(await png.data!.arrayBuffer());
    expect(pngBytes.subarray(1, 4).toString()).toBe("PNG");

    // The PDF is the print file: no watermark text, and it carries the snapshot hash.
    const pdf = await db.storage.from("proofs").download(proof!.proof_pdf_path!);
    const pdfDoc = await PDFDocument.load(new Uint8Array(await pdf.data!.arrayBuffer()), {
      updateMetadata: false,
    });
    expect(pdfDoc.getKeywords()).toContain(`sha256:${proof!.snapshot_hash}`);
    expect(pdfDoc.getPageCount()).toBe(1);

    await expect
      .poll(() => mailCount(request, `Proof v1 ready for order ${order.order_number}`), {
        timeout: 15_000,
      })
      .toBe(1);
  });

  test("the customer requests changes, gets v2, and approves it; stale approvals are refused", async ({
    browser,
    page,
    request,
  }) => {
    const design = await createStickerDesign("TEAM ALHPA");
    const order = await createQuoteOrder(1620, design);
    await payOrder(request, order);
    await waitForProof(order.id, 1);

    await logIn(page);
    await expect(page.getByTestId("active-proofs")).toContainText(order.order_number);
    await page.goto(`/account/orders/${order.id}`);
    await expect(page.getByTestId("order-status")).toHaveText("Proof ready");
    await expect(page.getByTestId("proof-image")).toBeVisible();
    await expect(page.getByTestId("proof-pdf")).toBeVisible();

    // Approval needs an explicit confirmation.
    const approve = page.getByRole("button", { name: "Approve proof v1" });
    await expect(approve).toBeDisabled();

    // A change request needs a comment.
    await page.getByRole("button", { name: "Request changes" }).click();
    await page.getByRole("button", { name: "Send change request" }).click();
    await expect(page.getByText("Tell us what to change.")).toBeVisible();
    await page.getByLabel("What should change?").fill("Typo: ALPHA, not ALHPA");
    await page.getByRole("button", { name: "Send change request" }).click();
    await expect(page.getByTestId("order-status")).toHaveText("Artwork check");
    await expect(page.getByText("Typo: ALPHA, not ALHPA", { exact: true })).toBeVisible();

    // The customer fixes the design (as the designer's save would) and asks for proof v2.
    await admin()
      .from("designs")
      .update({ document: stickerDocument("TEAM ALPHA") })
      .eq("id", design.id);
    await page.getByRole("button", { name: "Create proof v2 from my saved design" }).click();
    await expect(page.getByTestId("order-status")).toHaveText("Proof ready", { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Proof v2" })).toBeVisible();

    // A second tab still shows v2; approve it in the first tab.
    const other = await browser.newPage({ storageState: await page.context().storageState() });
    await other.goto(`/account/orders/${order.id}`);
    await expect(other.getByRole("button", { name: "Approve proof v2" })).toBeVisible();

    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Approve proof v2" }).click();
    await expect(page.getByTestId("proof-approved")).toContainText("You approved proof v2");
    await expect(page.getByTestId("order-status")).toHaveText("Proof approved");

    // The stale tab cannot approve again.
    await other.getByRole("checkbox").check();
    await other.getByRole("button", { name: "Approve proof v2" }).click();
    await expect(other.getByText(/no longer waiting for a decision/)).toBeVisible();
    await other.close();

    // The audit trail: v1 superseded (its change request stays in the log), one approval of v2.
    const db = admin();
    const { data: versions } = await db
      .from("proof_versions")
      .select("version, status, snapshot_hash")
      .eq("order_id", order.id)
      .order("version");
    expect(versions!.map((v) => v.status)).toEqual(["superseded", "approved"]);
    expect(versions![0]!.snapshot_hash).not.toBe(versions![1]!.snapshot_hash);
    const { data: events } = await db
      .from("proof_events")
      .select("action, snapshot_hash, comment")
      .eq("order_id", order.id)
      .order("created_at");
    expect(events).toEqual([
      expect.objectContaining({ action: "changes_requested", comment: "Typo: ALPHA, not ALHPA" }),
      expect.objectContaining({ action: "approved", snapshot_hash: versions![1]!.snapshot_hash }),
    ]);
    const { data: saved } = await db
      .from("orders")
      .select("files_unlocked_at, order_items(design_snapshot)")
      .eq("id", order.id)
      .single();
    expect(saved!.files_unlocked_at).not.toBeNull();
    expect(JSON.stringify(saved!.order_items[0]!.design_snapshot)).toContain("TEAM ALPHA");
    const { data: locked } = await db
      .from("designs")
      .select("is_locked")
      .eq("id", design.id)
      .single();
    expect(locked!.is_locked).toBe(true);

    await expect
      .poll(() => mailCount(request, `Proof approved for order ${order.order_number}`), {
        timeout: 15_000,
      })
      .toBe(1);
  });

  test("a revision must keep the size, material and quantity that were paid for", async ({
    page,
    request,
  }) => {
    const design = await createStickerDesign("SIZE CHECK");
    const order = await createQuoteOrder(1620, design);
    await payOrder(request, order);
    await waitForProof(order.id, 1);

    await logIn(page);
    await page.goto(`/account/orders/${order.id}`);
    await page.getByRole("button", { name: "Request changes" }).click();
    await page.getByLabel("What should change?").fill("Make it bigger");
    await page.getByRole("button", { name: "Send change request" }).click();
    await expect(page.getByTestId("order-status")).toHaveText("Artwork check");

    const { data: current } = await admin()
      .from("designs")
      .select("config")
      .eq("id", design.id)
      .single();
    await admin()
      .from("designs")
      .update({ config: { ...(current!.config as object), quantity: 500 } })
      .eq("id", design.id);
    await page.getByRole("button", { name: "Create proof v2 from my saved design" }).click();
    await expect(page.getByText(/no longer matches this order/)).toBeVisible();
  });
});
