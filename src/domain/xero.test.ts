import { describe, expect, it } from "vitest";

import {
  allocateTax,
  DEFAULT_XERO_SETTINGS,
  toCsv,
  XERO_COLUMNS,
  xeroDate,
  xeroInvoiceTotals,
  xeroRows,
  type XeroInvoiceInput,
} from "./xero";

const sticker: XeroInvoiceInput = {
  invoiceNumber: "INV-2026-000001",
  orderNumber: "DH-2026-000007",
  paidAt: "2026-11-24T06:10:00.000Z",
  currency: "GBP",
  taxRate: "0.2",
  contact: {
    name: "Priya Shah",
    company: "Shah Events",
    email: "priya@example.com",
    country: "GB",
  },
  division: "Labels & Stickers",
  item: {
    description: "Custom Stickers × 100 (50 × 50 mm, Gloss vinyl)",
    quantity: 100,
    unitNet: "0.15",
    discountPercent: "10",
  },
  setupFeeMinor: 0,
  subtotalNetMinor: 1350,
  taxMinor: 270,
  totalGrossMinor: 1620,
  cancelled: false,
};

describe("xeroRows", () => {
  it("itemises the product line when Xero's rounding gives the same amount", () => {
    const [row, ...rest] = xeroRows(sticker, DEFAULT_XERO_SETTINGS);
    expect(rest).toHaveLength(0);
    expect(row).toMatchObject({
      "*ContactName": "Shah Events",
      "*InvoiceNumber": "INV-2026-000001",
      Reference: "DH-2026-000007",
      "*InvoiceDate": "24/11/2026",
      "*DueDate": "24/11/2026",
      "*Quantity": "100",
      "*UnitAmount": "0.15",
      Discount: "10",
      "*AccountCode": "200",
      "*TaxType": "20% (VAT on Income)",
      TaxAmount: "2.70",
      TrackingName1: "Division",
      TrackingOption1: "Labels & Stickers",
      Currency: "GBP",
    });
  });

  it("falls back to one net line when itemising would round differently", () => {
    // 333 × £0.0333 = £11.0889 → Xero rounds to £11.09, but our line is £11.08.
    const odd = {
      ...sticker,
      item: { ...sticker.item, quantity: 333, unitNet: "0.0333", discountPercent: "0" },
      subtotalNetMinor: 1108,
      taxMinor: 222,
      totalGrossMinor: 1330,
    };
    const [row] = xeroRows(odd, DEFAULT_XERO_SETTINGS);
    expect(row).toMatchObject({ "*Quantity": "1", "*UnitAmount": "11.08", Discount: "" });
    expect(row!["*Description"]).toContain("(333 items)");
  });

  it("adds a setup line and splits tax so the invoice matches what was paid", () => {
    const withSetup = {
      ...sticker,
      setupFeeMinor: 500,
      subtotalNetMinor: 1850,
      taxMinor: 370,
      totalGrossMinor: 2220,
    };
    const rows = xeroRows(withSetup, DEFAULT_XERO_SETTINGS);
    expect(rows.map((r) => [r["*Description"], r["*UnitAmount"], r.TaxAmount])).toEqual([
      ["Custom Stickers × 100 (50 × 50 mm, Gloss vinyl)", "0.15", "2.70"],
      ["Setup", "5.00", "1.00"],
    ]);
    expect(xeroInvoiceTotals(rows)).toEqual({ netMinor: 1850, taxMinor: 370 });
  });

  it("marks cancelled orders and falls back to a contact name", () => {
    const [row] = xeroRows(
      {
        ...sticker,
        cancelled: true,
        contact: { name: null, company: " ", email: "a@b.c", country: null },
      },
      DEFAULT_XERO_SETTINGS,
    );
    expect(row!.Reference).toBe("DH-2026-000007 (cancelled)");
    expect(row!["*ContactName"]).toBe("a@b.c");
  });

  it("refuses an invoice that does not add up", () => {
    expect(() => xeroRows({ ...sticker, taxMinor: 271 }, DEFAULT_XERO_SETTINGS)).toThrow(/add up/);
  });
});

describe("helpers", () => {
  it("allocates tax exactly", () => {
    expect(allocateTax([1000, 1], 200)).toEqual([200, 0]);
    expect(allocateTax([333, 333, 334], 200)).toEqual([67, 67, 66]);
    expect(allocateTax([0], 0)).toEqual([0]);
  });

  it("uses the business's local date", () => {
    // 23:30 UTC on 30 June is already 1 July in London (BST).
    expect(xeroDate("2026-06-30T23:30:00Z", "GBP")).toBe("01/07/2026");
    expect(xeroDate("2026-06-30T20:00:00Z", "INR")).toBe("01/07/2026");
  });

  it("writes RFC 4180 CSV and neutralises formulas", () => {
    const csv = toCsv([{ a: 'Say "hi", ok', b: "=HYPERLINK(1)", c: "-1.50" }], ["a", "b", "c"]);
    expect(csv).toBe(`a,b,c\r\n"Say ""hi"", ok",'=HYPERLINK(1),'-1.50\r\n`);
    const header = toCsv([], XERO_COLUMNS).trim().split(",");
    expect(header[0]).toBe("*ContactName");
    expect(header).toHaveLength(28);
  });
});
