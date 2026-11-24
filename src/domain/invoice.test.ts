import { describe, expect, it } from "vitest";

import {
  buildInvoice,
  formatUnitPrice,
  invoiceFileName,
  InvoiceError,
  ratePercent,
  type InvoiceInput,
} from "./invoice";

const base: InvoiceInput = {
  invoiceNumber: "INV-2026-000012",
  orderNumber: "DH-2026-000034",
  issuedAt: "2026-11-24T09:15:00.000Z",
  currency: "GBP",
  taxLabel: "VAT",
  taxRate: "0.2000",
  seller: { name: "Digital Heroes Print (demo)", address: ["Demo address only"], vatNumber: null },
  buyer: { name: "Priya Shah", company: "Shah Events", email: "priya@example.com", country: "GB" },
  item: {
    description: "Custom Stickers × 100 (50 × 50 mm, Gloss vinyl)",
    quantity: 100,
    unitNet: "0.15",
  },
  discountPercent: "10",
  discountMinor: 150,
  setupFeeMinor: 0,
  subtotalNetMinor: 1350,
  taxMinor: 270,
  totalGrossMinor: 1620,
  paymentMethod: "card (Stripe)",
  reorderOf: null,
};

describe("buildInvoice", () => {
  it("lists the product before discount, the discount, then net, VAT and gross totals", () => {
    const invoice = buildInvoice(base);
    expect(invoice.title).toBe("VAT invoice");
    expect(invoice.lines).toEqual([
      {
        description: "Custom Stickers × 100 (50 × 50 mm, Gloss vinyl)",
        quantity: "100",
        unitPrice: "£0.15",
        amount: "£15.00",
      },
      { description: "Volume discount (10%)", quantity: "", unitPrice: "", amount: "−£1.50" },
    ]);
    expect(invoice.totals.map((t) => [t.label, t.value])).toEqual([
      ["Subtotal (excl. VAT)", "£13.50"],
      ["VAT at 20%", "£2.70"],
      ["Total (GBP)", "£16.20"],
      ["Paid on 24 November 2026", "−£16.20"],
      ["Amount due", "£0.00"],
    ]);
    expect(invoice.meta).toContainEqual({ label: "Invoice date", value: "24 November 2026" });
    expect(invoice.billTo).toEqual(["Priya Shah", "Shah Events", "priya@example.com", "GB"]);
  });

  it("adds a setup line and keeps the lines adding up to the subtotal", () => {
    const invoice = buildInvoice({
      ...base,
      discountMinor: 0,
      discountPercent: null,
      setupFeeMinor: 500,
      subtotalNetMinor: 2000,
      taxMinor: 400,
      totalGrossMinor: 2400,
    });
    expect(invoice.lines.map((l) => l.amount)).toEqual(["£15.00", "£5.00"]);
  });

  it("shows the original order of a reorder and the seller's VAT number", () => {
    const invoice = buildInvoice({
      ...base,
      reorderOf: "DH-2026-000007",
      seller: { ...base.seller, vatNumber: "GB123456789" },
    });
    expect(invoice.meta).toContainEqual({ label: "Reorder of", value: "DH-2026-000007" });
    expect(invoice.seller).toContain("VAT no. GB123456789");
  });

  it("refuses totals that do not add up", () => {
    expect(() => buildInvoice({ ...base, taxMinor: 271 })).toThrow(InvoiceError);
    expect(() =>
      buildInvoice({
        ...base,
        discountMinor: 0,
        subtotalNetMinor: 0,
        taxMinor: 0,
        totalGrossMinor: 0,
        setupFeeMinor: 10,
      }),
    ).toThrow(InvoiceError);
  });

  it("falls back to a generic customer when no billing details are known", () => {
    const invoice = buildInvoice({
      ...base,
      buyer: { name: null, company: " ", email: null, country: null },
    });
    expect(invoice.billTo).toEqual(["Customer"]);
  });

  it("uses 'Tax invoice' for GST", () => {
    expect(buildInvoice({ ...base, currency: "INR", taxLabel: "GST", taxRate: "0.18" }).title).toBe(
      "Tax invoice",
    );
  });
});

describe("invoice formatting", () => {
  it("formats tax rates without float noise", () => {
    expect(ratePercent("0.2000")).toBe("20%");
    expect(ratePercent("0.175")).toBe("17.5%");
    expect(ratePercent(0.18)).toBe("18%");
  });

  it("keeps sub-penny unit prices up to 4 decimals", () => {
    expect(formatUnitPrice("0.15", "GBP")).toBe("£0.15");
    expect(formatUnitPrice("0.1625", "GBP")).toBe("£0.1625");
    expect(formatUnitPrice("0.16254", "GBP")).toBe("£0.1625");
    expect(formatUnitPrice("2", "GBP")).toBe("£2.00");
  });

  it("builds a safe download name", () => {
    expect(invoiceFileName("INV-2026-000012", "DH-2026-000034")).toBe(
      "INV-2026-000012_DH-2026-000034.pdf",
    );
    expect(invoiceFileName("INV/../x", "DH")).toBe("INVx_DH.pdf");
  });
});
