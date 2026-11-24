import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { formatMajor, formatMm } from "@/lib/format";
import { requireAdmin } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Products (admin)" };

/** Every product by division, on sale or not (PRD p9 §14: managed in the admin, not in code). */
export default function AdminProductsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminProducts />
    </Suspense>
  );
}

async function AdminProducts() {
  await requireAdmin("/admin/products");
  const supabase = await createSupabaseServerClient(); // RLS: admins read inactive rows too
  const [{ data: divisions }, { data: settings }] = await Promise.all([
    supabase
      .from("divisions")
      .select(
        `id, name, sort_order, products(id, slug, name, is_active, base_unit_price::text, setup_fee_minor,
         min_width_mm, max_width_mm, min_height_mm, max_height_mm, min_qty, max_qty, sort_order,
         supports_variable_data, product_materials(material_id), templates(id))`,
      )
      .order("sort_order"),
    supabase.from("settings").select("currency").single(),
  ]);
  const currency = (settings?.currency ?? "GBP") as CurrencyCode;

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
      {(divisions ?? []).map((division) => (
        <section key={division.id} className="grid gap-2" aria-label={division.name}>
          <h2 className="text-lg font-semibold">{division.name}</h2>
          <ul className="grid gap-2" data-testid="admin-product-list">
            {[...division.products]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="bg-card hover:border-ink grid gap-1 rounded-xl border p-4 text-sm transition-colors md:grid-cols-[1fr_12rem_10rem_6rem] md:items-center md:gap-4"
                  >
                    <span className="grid">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground">
                        {p.product_materials.length} materials · {p.templates.length} templates
                        {p.supports_variable_data ? " · CSV" : ""}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {formatMm(Number(p.min_width_mm))}–{formatMm(Number(p.max_width_mm))} ×{" "}
                      {formatMm(Number(p.min_height_mm))}–{formatMm(Number(p.max_height_mm))} mm ·{" "}
                      {p.min_qty}+ items
                    </span>
                    <span className="num font-mono">
                      {formatMajor(p.base_unit_price, currency, 4)} / item
                      {p.setup_fee_minor ? ` + ${formatMinor(p.setup_fee_minor, currency)}` : ""}
                    </span>
                    <span className={p.is_active ? "" : "text-destructive"}>
                      {p.is_active ? "On sale" : "Hidden"}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
