import Decimal from "decimal.js";
import { z } from "zod";

import { formatMinor, type CurrencyCode } from "./money";

/**
 * Invoice content for a paid order (PRD p7 §09: customers download their invoices).
 * Pure: the server loads the order and renders this model to PDF. Lines follow the Xero shape
 * of DECISIONS D-03: net line amounts, then tax on the net subtotal, then the gross total.
 */

export const invoiceInputSchema = z.object({
  invoiceNumber: z.string().min(1),
  orderNumber: z.string().min(1),
  /** Payment date (the tax point). */
  issuedAt: z.string().datetime({ offset: true }),
  currency: z.enum(["GBP", "INR"]),
  taxLabel: z.string().min(1),
  /** Fraction, e.g. "0.2". */
  taxRate: z.union([z.string(), z.number()]),
  seller: z.object({
    name: z.string(),
    address: z.array(z.string()),
    vatNumber: z.string().nullable(),
  }),
  buyer: z.object({
    name: z.string().nullable(),
    company: z.string().nullable(),
    email: z.string().nullable(),
    country: z.string().nullable(),
  }),
  item: z.object({
    description: z.string(),
    quantity: z.number().int().positive(),
    /** Net unit price before the volume discount, exact decimal string. */
    unitNet: z.string(),
  }),
  discountPercent: z.string().nullable(),
  discountMinor: z.number().int().nonnegative(),
  setupFeeMinor: z.number().int().nonnegative(),
  subtotalNetMinor: z.number().int().nonnegative(),
  taxMinor: z.number().int().nonnegative(),
  totalGrossMinor: z.number().int().nonnegative(),
  paymentMethod: z.string(),
  reorderOf: z.string().nullable(),
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export type InvoiceLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
};

export type Invoice = {
  title: string;
  number: string;
  meta: { label: string; value: string }[];
  seller: string[];
  billTo: string[];
  lines: InvoiceLine[];
  totals: { label: string; value: string; strong?: boolean }[];
  notes: string[];
};

export class InvoiceError extends Error {}

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "0.2" → "20%", "0.175" → "17.5%". */
export function ratePercent(rate: string | number): string {
  return `${new Decimal(rate).times(100).toDecimalPlaces(3).toString()}%`;
}

/** Unit price with up to 4 decimals (sticker unit prices are fractions of a penny). */
export function formatUnitPrice(unitNet: string, currency: CurrencyCode): string {
  const value = new Decimal(unitNet).toDecimalPlaces(4);
  const digits = Math.min(4, Math.max(2, value.decimalPlaces()));
  return new Intl.NumberFormat(currency === "GBP" ? "en-GB" : "en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value.toFixed(digits) as unknown as number); // Intl formats decimal strings exactly
}

export function buildInvoice(raw: InvoiceInput): Invoice {
  const input = invoiceInputSchema.parse(raw);
  const money = (minor: number) => formatMinor(minor, input.currency);

  if (input.subtotalNetMinor + input.taxMinor !== input.totalGrossMinor) {
    throw new InvoiceError("Invoice totals do not add up");
  }
  // The product line before discount: subtotal = product − discount + setup.
  const productNetMinor = input.subtotalNetMinor - input.setupFeeMinor + input.discountMinor;
  if (productNetMinor < 0) throw new InvoiceError("Invoice lines do not add up");

  const lines: InvoiceLine[] = [
    {
      description: input.item.description,
      quantity: input.item.quantity.toLocaleString("en-GB"),
      unitPrice: formatUnitPrice(input.item.unitNet, input.currency),
      amount: money(productNetMinor),
    },
  ];
  if (input.discountMinor > 0) {
    lines.push({
      description: `Volume discount${input.discountPercent ? ` (${input.discountPercent}%)` : ""}`,
      quantity: "",
      unitPrice: "",
      amount: `−${money(input.discountMinor)}`,
    });
  }
  if (input.setupFeeMinor > 0) {
    lines.push({
      description: "Setup",
      quantity: "1",
      unitPrice: money(input.setupFeeMinor),
      amount: money(input.setupFeeMinor),
    });
  }

  const issued = DATE.format(new Date(input.issuedAt));
  const buyer = input.buyer;
  const billTo = [buyer.name, buyer.company, buyer.email, buyer.country].filter((v): v is string =>
    Boolean(v && v.trim()),
  );

  return {
    title: input.taxLabel === "VAT" ? "VAT invoice" : "Tax invoice",
    number: input.invoiceNumber,
    meta: [
      { label: "Invoice number", value: input.invoiceNumber },
      { label: "Invoice date", value: issued },
      { label: "Order", value: input.orderNumber },
      ...(input.reorderOf ? [{ label: "Reorder of", value: input.reorderOf }] : []),
    ],
    seller: [
      input.seller.name,
      ...input.seller.address,
      ...(input.seller.vatNumber ? [`${input.taxLabel} no. ${input.seller.vatNumber}`] : []),
    ],
    billTo: billTo.length > 0 ? billTo : ["Customer"],
    lines,
    totals: [
      { label: `Subtotal (excl. ${input.taxLabel})`, value: money(input.subtotalNetMinor) },
      { label: `${input.taxLabel} at ${ratePercent(input.taxRate)}`, value: money(input.taxMinor) },
      { label: `Total (${input.currency})`, value: money(input.totalGrossMinor), strong: true },
      { label: `Paid on ${issued}`, value: `−${money(input.totalGrossMinor)}` },
      { label: "Amount due", value: money(0), strong: true },
    ],
    notes: [
      `Paid in full by ${input.paymentMethod}. Thank you for your order.`,
      `Prices are net; ${input.taxLabel} is charged on the subtotal.`,
    ],
  };
}

/** File name for the download, e.g. INV-2026-000012_DH-2026-000034.pdf. */
export function invoiceFileName(invoiceNumber: string, orderNumber: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9-]/g, "");
  return `${safe(invoiceNumber)}_${safe(orderNumber)}.pdf`;
}
