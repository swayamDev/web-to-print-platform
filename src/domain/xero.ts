import Decimal from "decimal.js";

import type { CurrencyCode } from "./money";

/**
 * Xero sales-invoice export (PRD p9 §14: "Xero-ready accounting export"). Builds rows in the
 * column layout of Xero's "Import invoices" CSV template, so the file can be imported as is
 * (Business › Invoices › Import, amounts "Tax exclusive").
 *
 * Totals must match what the customer paid to the penny, so:
 *  - each line carries its own TaxAmount, allocated so the invoice's tax equals ours exactly;
 *  - the product line is itemised (quantity × unit price, discount %) only when Xero's own
 *    rounding gives our line amount; otherwise it is exported as one line for the net amount.
 */

export const XERO_COLUMNS = [
  "*ContactName",
  "EmailAddress",
  "POAddressLine1",
  "POAddressLine2",
  "POAddressLine3",
  "POAddressLine4",
  "POCity",
  "PORegion",
  "POPostalCode",
  "POCountry",
  "*InvoiceNumber",
  "Reference",
  "*InvoiceDate",
  "*DueDate",
  "InventoryItemCode",
  "*Description",
  "*Quantity",
  "*UnitAmount",
  "Discount",
  "*AccountCode",
  "*TaxType",
  "TaxAmount",
  "TrackingName1",
  "TrackingOption1",
  "TrackingName2",
  "TrackingOption2",
  "Currency",
  "BrandingTheme",
] as const;

export type XeroColumn = (typeof XERO_COLUMNS)[number];
export type XeroRow = Record<XeroColumn, string>;

export type XeroSettings = {
  salesAccountCode: string;
  taxType: string;
  /** Tracking category for divisions; empty to leave tracking out. */
  trackingName: string;
};

export const DEFAULT_XERO_SETTINGS: XeroSettings = {
  salesAccountCode: "200",
  taxType: "20% (VAT on Income)",
  trackingName: "Division",
};

export type XeroInvoiceInput = {
  invoiceNumber: string;
  orderNumber: string;
  /** Payment time (the tax point), ISO. */
  paidAt: string;
  currency: CurrencyCode;
  taxRate: string;
  contact: {
    name: string | null;
    company: string | null;
    email: string | null;
    country: string | null;
  };
  division: string | null;
  item: { description: string; quantity: number; unitNet: string; discountPercent: string };
  setupFeeMinor: number;
  subtotalNetMinor: number;
  taxMinor: number;
  totalGrossMinor: number;
  cancelled: boolean;
};

const TIME_ZONE: Record<CurrencyCode, string> = { GBP: "Europe/London", INR: "Asia/Kolkata" };

/** dd/mm/yyyy in the business's time zone (Xero's UK date format). */
export function xeroDate(iso: string, currency: CurrencyCode): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE[currency],
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("day")}/${get("month")}/${get("year")}`;
}

const money = (minor: number) => new Decimal(minor).dividedBy(100).toFixed(2);
const halfUp = (d: Decimal, places: number) => d.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);

/** Split the invoice tax across lines in proportion, so the parts add up exactly. */
export function allocateTax(lineNetMinor: number[], taxMinor: number): number[] {
  const total = lineNetMinor.reduce((a, b) => a + b, 0);
  if (total === 0) return lineNetMinor.map((_, i) => (i === 0 ? taxMinor : 0));
  const parts = lineNetMinor.map((net) =>
    halfUp(new Decimal(taxMinor).times(net).dividedBy(total), 0).toNumber(),
  );
  const drift = taxMinor - parts.reduce((a, b) => a + b, 0);
  parts[parts.length - 1]! += drift;
  return parts;
}

export function xeroRows(input: XeroInvoiceInput, settings: XeroSettings): XeroRow[] {
  if (input.subtotalNetMinor + input.taxMinor !== input.totalGrossMinor) {
    throw new Error(`Invoice ${input.invoiceNumber} does not add up`);
  }
  const productNetMinor = input.subtotalNetMinor - input.setupFeeMinor;
  const lines: {
    description: string;
    quantity: string;
    unitAmount: string;
    discount: string;
    netMinor: number;
  }[] = [];

  const discount = new Decimal(input.item.discountPercent || "0");
  const unit = new Decimal(input.item.unitNet);
  const xeroLine = halfUp(
    unit.times(input.item.quantity).times(new Decimal(100).minus(discount)).dividedBy(100),
    2,
  );
  if (xeroLine.times(100).equals(productNetMinor) && unit.decimalPlaces() <= 4) {
    lines.push({
      description: input.item.description,
      quantity: String(input.item.quantity),
      unitAmount: unit.toFixed(Math.max(2, unit.decimalPlaces())),
      discount: discount.isZero() ? "" : discount.toString(),
      netMinor: productNetMinor,
    });
  } else {
    lines.push({
      description: `${input.item.description} (${input.item.quantity} items${discount.isZero() ? "" : `, ${discount.toString()}% volume discount`})`,
      quantity: "1",
      unitAmount: money(productNetMinor),
      discount: "",
      netMinor: productNetMinor,
    });
  }
  if (input.setupFeeMinor > 0) {
    lines.push({
      description: "Setup",
      quantity: "1",
      unitAmount: money(input.setupFeeMinor),
      discount: "",
      netMinor: input.setupFeeMinor,
    });
  }
  const taxes = allocateTax(
    lines.map((l) => l.netMinor),
    input.taxMinor,
  );

  const contactName =
    [input.contact.company, input.contact.name].find((v) => v && v.trim())?.trim() ??
    input.contact.email ??
    "Customer";
  const date = xeroDate(input.paidAt, input.currency);
  return lines.map((line, i) => ({
    "*ContactName": contactName,
    EmailAddress: input.contact.email ?? "",
    POAddressLine1: "",
    POAddressLine2: "",
    POAddressLine3: "",
    POAddressLine4: "",
    POCity: "",
    PORegion: "",
    POPostalCode: "",
    POCountry: input.contact.country ?? "",
    "*InvoiceNumber": input.invoiceNumber,
    Reference: input.cancelled ? `${input.orderNumber} (cancelled)` : input.orderNumber,
    "*InvoiceDate": date,
    // Paid online at checkout, so it was due the same day.
    "*DueDate": date,
    InventoryItemCode: "",
    "*Description": line.description,
    "*Quantity": line.quantity,
    "*UnitAmount": line.unitAmount,
    Discount: line.discount,
    "*AccountCode": settings.salesAccountCode,
    "*TaxType": settings.taxType,
    TaxAmount: money(taxes[i]!),
    TrackingName1: settings.trackingName && input.division ? settings.trackingName : "",
    TrackingOption1: settings.trackingName && input.division ? input.division : "",
    TrackingName2: "",
    TrackingOption2: "",
    Currency: input.currency,
    BrandingTheme: "",
  }));
}

/** What Xero will calculate for an invoice from our rows (used to prove the export adds up). */
export function xeroInvoiceTotals(rows: XeroRow[]): { netMinor: number; taxMinor: number } {
  let net = new Decimal(0);
  let tax = new Decimal(0);
  for (const row of rows) {
    const discount = new Decimal(row.Discount || "0");
    net = net.plus(
      halfUp(
        new Decimal(row["*UnitAmount"])
          .times(row["*Quantity"])
          .times(new Decimal(100).minus(discount))
          .dividedBy(100),
        2,
      ),
    );
    tax = tax.plus(row.TaxAmount);
  }
  return { netMinor: net.times(100).toNumber(), taxMinor: tax.times(100).toNumber() };
}

/**
 * RFC 4180 CSV with CRLF line endings. Text that a spreadsheet would run as a formula
 * (starting with = + - @ or a tab/CR) is prefixed with an apostrophe (CSV injection).
 */
export function toCsv(rows: Record<string, string>[], columns: readonly string[]): string {
  const cell = (raw: string, numeric: boolean) => {
    let value = raw;
    if (!numeric && /^[=+\-@\t\r]/.test(value)) value = `'${value}`;
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  const numericColumns = new Set(["*Quantity", "*UnitAmount", "Discount", "TaxAmount"]);
  const lines = [
    columns.map((c) => cell(c, false)).join(","),
    ...rows.map((row) => columns.map((c) => cell(row[c] ?? "", numericColumns.has(c))).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
