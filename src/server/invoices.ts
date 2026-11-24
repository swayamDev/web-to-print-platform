import "server-only";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { buildInvoice, invoiceFileName, type Invoice, type InvoiceInput } from "@/domain/invoice";
import { NO_SHAPING } from "@/lib/print/pdf";
import { loadPrintFonts } from "@/server/render";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

/**
 * Invoices for paid orders (PRD p7 §09). Rendered on request from the order as recorded at
 * payment (never re-priced), with the payment date as the PDF date, so the same invoice always
 * gives the same file.
 */

export type InvoiceFile = { fileName: string; bytes: Uint8Array };

type Viewer = { id: string; role: "customer" | "admin" };

/** The invoice for one order, if it is paid and the viewer owns it (or is an admin). */
export async function invoiceForOrder(
  orderId: string,
  viewer: Viewer,
): Promise<InvoiceFile | null> {
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select(
      `id, order_number, customer_id, invoice_number, paid_at, currency, tax_rate, subtotal_net_minor,
       discount_minor, tax_minor, total_gross_minor, pricing_snapshot, billing_details, payment_provider,
       reorder_of:reorder_of_order_id(order_number),
       order_items(description, quantity, unit_net, discount_percent)`,
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order || !order.invoice_number || !order.paid_at) return null;
  if (viewer.role !== "admin" && order.customer_id !== viewer.id) return null;
  const item = order.order_items[0];
  if (!item) return null;

  const [{ data: settings }, { data: profile }] = await Promise.all([
    admin.from("settings").select("tax_label, company_legal").single(),
    admin.from("profiles").select("full_name, company_name").eq("id", order.customer_id).single(),
  ]);
  const legal = (settings?.company_legal ?? {}) as {
    name?: string;
    address?: string[];
    vat_number?: string | null;
  };
  const billing = (order.billing_details ?? {}) as {
    name?: string | null;
    email?: string | null;
    country?: string | null;
  };
  const quote = (order.pricing_snapshot as { quote?: { setupFeeMinor?: number } }).quote;
  const reorderOf = ([] as { order_number: string }[]).concat(order.reorder_of ?? [])[0];

  const input: InvoiceInput = {
    invoiceNumber: order.invoice_number,
    orderNumber: order.order_number,
    issuedAt: order.paid_at,
    currency: order.currency as InvoiceInput["currency"],
    taxLabel: settings?.tax_label ?? "VAT",
    taxRate: String(order.tax_rate),
    seller: {
      name: legal.name ?? "Digital Heroes Print",
      address: legal.address ?? [],
      vatNumber: legal.vat_number ?? null,
    },
    buyer: {
      name: profile?.full_name ?? billing.name ?? null,
      company: profile?.company_name ?? null,
      email: billing.email ?? null,
      country: billing.country ?? null,
    },
    item: {
      description: item.description,
      quantity: item.quantity,
      unitNet: String(item.unit_net),
    },
    discountPercent:
      Number(item.discount_percent) > 0 ? String(Number(item.discount_percent)) : null,
    discountMinor: order.discount_minor,
    setupFeeMinor: quote?.setupFeeMinor ?? 0,
    subtotalNetMinor: order.subtotal_net_minor,
    taxMinor: order.tax_minor,
    totalGrossMinor: order.total_gross_minor,
    paymentMethod: order.payment_provider === "stripe" ? "card (Stripe)" : "card",
    reorderOf: reorderOf?.order_number ?? null,
  };
  const invoice = buildInvoice(input);
  const bytes = await renderInvoicePdf(invoice, new Date(order.paid_at));
  return { fileName: invoiceFileName(order.invoice_number, order.order_number), bytes };
}

// -----------------------------------------------------------------------------
// PDF layout: A4 portrait, 48 pt margins.

const A4 = { w: 595.28, h: 841.89 };
const M = 48;
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.85, 0.85, 0.85);

type TextOptions = {
  font?: PDFFont;
  size?: number;
  color?: ReturnType<typeof rgb>;
  align?: "left" | "right";
};

export async function renderInvoicePdf(invoice: Invoice, date: Date): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${invoice.title} ${invoice.number}`);
  doc.setSubject(invoice.title);
  doc.setKeywords([invoice.number]);
  doc.setProducer("Digital Heroes Print");
  doc.setCreator("Digital Heroes Print invoices");
  doc.setCreationDate(date);
  doc.setModificationDate(date);

  const fonts = await loadPrintFonts();
  const embed = (id: string) =>
    doc.embedFont(fonts.get(id)!.bytes, { subset: true, features: NO_SHAPING });
  const regular = await embed("inter-regular");
  const bold = await embed("inter-semibold");

  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const text = (p: PDFPage, s: string, x: number, yy: number, opts: TextOptions = {}) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10;
    const width = font.widthOfTextAtSize(s, size);
    p.drawText(s, {
      x: opts.align === "right" ? x - width : x,
      y: yy,
      size,
      font,
      color: opts.color ?? INK,
    });
  };

  // Header: seller on the left, title and number on the right.
  text(page, invoice.title, A4.w - M, y - 14, { font: bold, size: 20, align: "right" });
  text(page, invoice.number, A4.w - M, y - 32, { size: 11, color: MUTED, align: "right" });
  invoice.seller.forEach((line, i) =>
    text(page, line, M, y - 12 - i * 14, {
      font: i === 0 ? bold : regular,
      size: i === 0 ? 12 : 10,
    }),
  );
  y -= Math.max(48, 12 + invoice.seller.length * 14) + 24;

  // Bill to + invoice details.
  const right = A4.w / 2 + 20;
  text(page, "BILL TO", M, y, { font: bold, size: 8, color: MUTED });
  text(page, "DETAILS", right, y, { font: bold, size: 8, color: MUTED });
  y -= 16;
  const blockTop = y;
  invoice.billTo.forEach((line, i) => text(page, line, M, blockTop - i * 14));
  invoice.meta.forEach((m, i) => {
    text(page, m.label, right, blockTop - i * 14, { color: MUTED });
    text(page, m.value, A4.w - M, blockTop - i * 14, { align: "right" });
  });
  y = blockTop - Math.max(invoice.billTo.length, invoice.meta.length) * 14 - 24;

  // Lines.
  const col = { qty: A4.w - M - 190, unit: A4.w - M - 95, amount: A4.w - M };
  const descWidth = col.qty - 60 - M;
  const header = () => {
    const h = { font: bold, size: 8, color: MUTED };
    text(page, "DESCRIPTION", M, y, h);
    text(page, "QTY", col.qty, y, { ...h, align: "right" });
    text(page, "UNIT (NET)", col.unit, y, { ...h, align: "right" });
    text(page, "AMOUNT (NET)", col.amount, y, { ...h, align: "right" });
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.75, color: INK });
    y -= 16;
  };
  header();
  for (const line of invoice.lines) {
    const wrapped = wrap(line.description, regular, 10, descWidth);
    if (y - wrapped.length * 13 < M + 160) {
      page = doc.addPage([A4.w, A4.h]);
      y = A4.h - M;
      header();
    }
    wrapped.forEach((part, i) => text(page, part, M, y - i * 13));
    text(page, line.quantity, col.qty, y, { align: "right" });
    text(page, line.unitPrice, col.unit, y, { align: "right" });
    text(page, line.amount, col.amount, y, { align: "right" });
    y -= wrapped.length * 13 + 4;
    page.drawLine({
      start: { x: M, y },
      end: { x: A4.w - M, y },
      thickness: 0.5,
      color: RULE,
    });
    y -= 16;
  }

  // Totals.
  y -= 4;
  const labelX = col.qty - 60;
  for (const total of invoice.totals) {
    const font = total.strong ? bold : regular;
    if (total.strong) {
      page.drawLine({
        start: { x: labelX, y: y + 12 },
        end: { x: A4.w - M, y: y + 12 },
        thickness: 0.75,
        color: INK,
      });
    }
    text(page, total.label, labelX, y, { font });
    text(page, total.value, col.amount, y, { font, align: "right" });
    y -= total.strong ? 22 : 16;
  }

  // Notes.
  y -= 16;
  for (const note of invoice.notes) {
    for (const part of wrap(note, regular, 9, A4.w - 2 * M)) {
      text(page, part, M, y, { size: 9, color: MUTED });
      y -= 12;
    }
  }

  return doc.save({ useObjectStreams: false });
}

/** Greedy word wrap to a width in points. */
function wrap(s: string, font: PDFFont, size: number, width: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(next, size) > width) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}
