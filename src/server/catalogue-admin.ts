import "server-only";

import { z } from "zod";

import {
  changedFields,
  fromMinorUnits,
  productEditSchema,
  toProductPatch,
  type ProductEditInput,
} from "@/domain/catalogue-admin";
import type { CurrencyCode } from "@/domain/money";
import { buildReport, type ReportOrder, type ReportPeriod } from "@/domain/reports";
import {
  DEFAULT_XERO_SETTINGS,
  toCsv,
  XERO_COLUMNS,
  xeroRows,
  type XeroSettings,
} from "@/domain/xero";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { Json } from "@/types/db";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * Admin catalogue management, reports and the Xero export (PRD p4 §03, p9 §14). Callers check
 * the admin role first; the database functions check it again.
 */

export type SaveResult = { ok: true; message: string } | { ok: false; message: string };

const dbMessage = (message: string | undefined): string => {
  if (message?.includes("admin_required")) return "Only admins can do this.";
  if (message?.includes("one_default_material")) return "Choose exactly one default material.";
  if (message?.includes("violates check constraint")) return "Some values are out of range.";
  return "Could not save. Please try again.";
};

// -----------------------------------------------------------------------------
// Products

export type MaterialRow = { id: string; slug: string; name: string; isActive: boolean };

export type ProductEditor = {
  initial: ProductEditInput;
  slug: string;
  divisionName: string;
  pricingModel: "area" | "unit";
  supportsVariableData: boolean;
  materials: MaterialRow[];
  usesGlobalTiers: boolean;
  globalTiers: { minQty: number; percentOff: string }[];
  currency: CurrencyCode;
};

/** The product as the edit form shows it, with every material that could be offered. */
export async function loadProductEditor(productId: string): Promise<ProductEditor | null> {
  if (!z.string().uuid().safeParse(productId).success) return null;
  const supabase = await createSupabaseServerClient(); // RLS: admins read everything
  const [{ data: p }, { data: materials }, { data: globalTiers }, { data: settings }] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          `id, slug, name, short_description, is_active, pricing_model, base_unit_price::text,
           setup_fee_minor, variable_data_unit_fee::text, min_width_mm, max_width_mm, min_height_mm,
           max_height_mm, default_width_mm, default_height_mm, min_qty, max_qty, qty_step, bleed_mm,
           safe_margin_mm, output_dpi, supports_variable_data, division:divisions(name),
           product_materials(material_id, price_per_cm2::text, price_per_unit::text, is_default, sort_order),
           discount_tiers(min_qty, percent_off::text)`,
        )
        .eq("id", productId)
        .maybeSingle(),
      supabase.from("materials").select("id, slug, name, is_active").order("name"),
      supabase
        .from("discount_tiers")
        .select("min_qty, percent_off::text")
        .is("product_id", null)
        .order("min_qty"),
      supabase.from("settings").select("currency").single(),
    ]);
  if (!p) return null;

  const offered = new Map(p.product_materials.map((pm) => [pm.material_id, pm]));
  const allMaterials = (materials ?? []).map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    isActive: m.is_active,
  }));
  // Offered materials first, in their order; then the rest alphabetically.
  allMaterials.sort((a, b) => {
    const pa = offered.get(a.id)?.sort_order ?? 1e6;
    const pb = offered.get(b.id)?.sort_order ?? 1e6;
    return pa - pb || a.name.localeCompare(b.name);
  });
  const tiers = [...p.discount_tiers].sort((a, b) => a.min_qty - b.min_qty);

  return {
    slug: p.slug,
    divisionName: p.division?.name ?? "",
    pricingModel: p.pricing_model,
    supportsVariableData: p.supports_variable_data,
    materials: allMaterials,
    usesGlobalTiers: tiers.length === 0,
    globalTiers: (globalTiers ?? []).map((t) => ({ minQty: t.min_qty, percentOff: t.percent_off })),
    currency: (settings?.currency ?? "GBP") as CurrencyCode,
    initial: {
      productId: p.id,
      name: p.name,
      shortDescription: p.short_description ?? "",
      isActive: p.is_active,
      baseUnitPrice: p.base_unit_price,
      setupFee: fromMinorUnits(p.setup_fee_minor),
      variableDataUnitFee: p.variable_data_unit_fee,
      minWidthMm: String(p.min_width_mm),
      maxWidthMm: String(p.max_width_mm),
      minHeightMm: String(p.min_height_mm),
      maxHeightMm: String(p.max_height_mm),
      defaultWidthMm: String(p.default_width_mm),
      defaultHeightMm: String(p.default_height_mm),
      minQty: String(p.min_qty),
      maxQty: String(p.max_qty),
      qtyStep: String(p.qty_step),
      bleedMm: String(p.bleed_mm),
      safeMarginMm: String(p.safe_margin_mm),
      outputDpi: String(p.output_dpi),
      materials: allMaterials.map((m) => {
        const pm = offered.get(m.id);
        return {
          materialId: m.id,
          offered: Boolean(pm),
          isDefault: pm?.is_default ?? false,
          pricePerCm2: pm?.price_per_cm2 ?? "0",
          pricePerUnit: pm?.price_per_unit ?? "0",
        };
      }),
      tiers: tiers.map((t) => ({ minQty: String(t.min_qty), percentOff: t.percent_off })),
    },
  };
}

export async function saveProduct(actorId: string, input: unknown): Promise<SaveResult> {
  const parsed = productEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const edit = parsed.data;
  const patch = toProductPatch(edit);

  const admin = createSupabaseAdminClient();
  const { data: before } = await admin
    .from("products")
    .select(Object.keys(patch).join(", "))
    .eq("id", edit.productId)
    .maybeSingle();
  if (!before) return { ok: false, message: "This product could not be found." };

  const { error } = await admin.rpc("admin_update_product", {
    p_actor: actorId,
    p_product_id: edit.productId,
    p_patch: patch,
    p_materials: edit.materials
      .filter((m) => m.offered)
      .map((m) => ({
        materialId: m.materialId,
        pricePerCm2: m.pricePerCm2,
        pricePerUnit: m.pricePerUnit,
        isDefault: m.isDefault,
      })),
    p_tiers: [...edit.tiers]
      .sort((a, b) => a.minQty - b.minQty)
      .map((t) => ({ minQty: t.minQty, percentOff: t.percentOff })),
    p_changes: changedFields(before as unknown as Record<string, unknown>, patch) as Json,
  });
  if (error) return { ok: false, message: dbMessage(error.message) };
  return { ok: true, message: "Saved. New quotes and checkouts use these settings now." };
}

// -----------------------------------------------------------------------------
// Templates

export const templateEditSchema = z.object({
  templateId: z.string().uuid(),
  name: z.string().trim().min(2, "Name is too short").max(120),
  groupName: z.string().trim().max(60),
  description: z.string().trim().max(300),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  isActive: z.boolean(),
});

export async function saveTemplate(actorId: string, input: unknown): Promise<SaveResult> {
  const parsed = templateEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const t = parsed.data;
  const { error } = await createSupabaseAdminClient().rpc("admin_update_template", {
    p_actor: actorId,
    p_template_id: t.templateId,
    p_patch: {
      name: t.name,
      group_name: t.groupName,
      description: t.description,
      sort_order: t.sortOrder,
      is_active: t.isActive,
    },
  });
  if (error) return { ok: false, message: dbMessage(error.message) };
  return { ok: true, message: t.isActive ? "Saved." : "Saved. Customers no longer see it." };
}

// -----------------------------------------------------------------------------
// Reports and the Xero export

/** Orders that were created or paid in the period, with what the report needs. */
async function periodOrders(period: ReportPeriod) {
  const supabase = await createSupabaseServerClient(); // RLS: admins read every order
  const from = `${period.from}T00:00:00Z`;
  const to = `${period.to}T00:00:00Z`;
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, invoice_number, status, created_at, paid_at, currency, tax_rate,
       total_gross_minor, subtotal_net_minor, tax_minor, pricing_snapshot, billing_details,
       customer_id, reorder_of_order_id,
       customer:profiles!orders_customer_id_fkey(full_name, company_name),
       order_items(description, quantity, unit_net::text, discount_percent::text, is_variable_data,
         product:products(name, division:divisions(name)))`,
    )
    .or(`and(created_at.gte.${from},created_at.lt.${to}),and(paid_at.gte.${from},paid_at.lt.${to})`)
    .order("paid_at", { ascending: true, nullsFirst: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadReport(period: ReportPeriod) {
  const orders = await periodOrders(period);
  const rows: ReportOrder[] = orders.map((o) => {
    const item = o.order_items[0];
    return {
      status: o.status,
      createdAt: new Date(o.created_at).toISOString(),
      paidAt: o.paid_at ? new Date(o.paid_at).toISOString() : null,
      totalGrossMinor: o.total_gross_minor,
      subtotalNetMinor: o.subtotal_net_minor,
      taxMinor: o.tax_minor,
      product: item?.product?.name ?? "Unknown product",
      division: item?.product?.division?.name ?? "Unknown division",
      quantity: item?.quantity ?? 0,
      isReorder: Boolean(o.reorder_of_order_id),
      isVariableData: Boolean(item?.is_variable_data),
    };
  });
  return {
    report: buildReport(rows, period),
    currency: (orders[0]?.currency ?? "GBP") as CurrencyCode,
    truncated: orders.length >= 5000,
  };
}

const xeroSettingsSchema = z.object({
  salesAccountCode: z.string().trim().min(1, "Enter the sales account code").max(20),
  taxType: z.string().trim().min(1, "Enter the tax rate name used in Xero").max(60),
  trackingName: z.string().trim().max(30),
});

export async function loadXeroSettings(): Promise<XeroSettings> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("settings").select("xero").single();
  const parsed = xeroSettingsSchema.safeParse(data?.xero);
  return parsed.success ? parsed.data : DEFAULT_XERO_SETTINGS;
}

export async function saveXeroSettings(actorId: string, input: unknown): Promise<SaveResult> {
  const parsed = xeroSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const { error } = await createSupabaseAdminClient().rpc("admin_update_xero_settings", {
    p_actor: actorId,
    p_xero: parsed.data,
  });
  if (error) return { ok: false, message: dbMessage(error.message) };
  return { ok: true, message: "Saved." };
}

/** Every invoice issued (paid) in the period, as a Xero import CSV. Logged in the audit trail. */
export async function exportXeroCsv(
  actorId: string,
  period: ReportPeriod,
): Promise<{ fileName: string; csv: string; invoices: number }> {
  const admin = createSupabaseAdminClient();
  const [orders, settings] = await Promise.all([periodOrders(period), loadXeroSettings()]);
  const from = `${period.from}T00:00:00Z`;
  const to = `${period.to}T00:00:00Z`;
  const invoiced = orders.filter(
    (o) =>
      o.invoice_number &&
      o.paid_at &&
      new Date(o.paid_at).toISOString() >= from &&
      new Date(o.paid_at).toISOString() < to,
  );

  // Sign-in emails live in auth.users; one lookup per customer.
  const emails = new Map<string, string | null>();
  await Promise.all(
    [...new Set(invoiced.map((o) => o.customer_id))].map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      emails.set(id, data.user?.email ?? null);
    }),
  );

  const rows = invoiced.flatMap((o) => {
    const item = o.order_items[0]!;
    const billing = (o.billing_details ?? {}) as { name?: string | null; country?: string | null };
    const quote = (o.pricing_snapshot as { quote?: { setupFeeMinor?: number } }).quote;
    return xeroRows(
      {
        invoiceNumber: o.invoice_number!,
        orderNumber: o.order_number,
        paidAt: new Date(o.paid_at!).toISOString(),
        currency: o.currency as CurrencyCode,
        taxRate: String(o.tax_rate),
        contact: {
          name: o.customer?.full_name ?? billing.name ?? null,
          company: o.customer?.company_name ?? null,
          email: emails.get(o.customer_id) ?? null,
          country: billing.country ?? null,
        },
        division: item.product?.division?.name ?? null,
        item: {
          description: item.description,
          quantity: item.quantity,
          unitNet: item.unit_net,
          discountPercent: item.discount_percent,
        },
        setupFeeMinor: quote?.setupFeeMinor ?? 0,
        subtotalNetMinor: o.subtotal_net_minor,
        taxMinor: o.tax_minor,
        totalGrossMinor: o.total_gross_minor,
        cancelled: o.status === "cancelled",
      },
      settings,
    );
  });

  await admin.from("audit_logs").insert({
    actor_id: actorId,
    action: "export.xero",
    entity_type: "export",
    entity_id: `${period.from}..${period.to}`,
    diff: { invoices: invoiced.length, rows: rows.length },
  });
  return {
    fileName: `xero-invoices_${period.from}_to_${period.to}.csv`,
    csv: toCsv(rows, XERO_COLUMNS),
    invoices: invoiced.length,
  };
}
