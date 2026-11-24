import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ProductForm } from "@/components/admin/product-form";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { requireAdmin } from "@/server/auth";
import { loadProductEditor } from "@/server/catalogue-admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Edit product (admin)" };

type Props = { params: Promise<{ id: string }> };

export default function AdminProductPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminProduct {...props} />
    </Suspense>
  );
}

const SYMBOL = { GBP: "£", INR: "₹" } as const;

async function AdminProduct({ params }: Props) {
  const { id } = await params;
  await requireAdmin(`/admin/products/${id}`);
  const editor = await loadProductEditor(id);
  if (!editor) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: history } = await supabase
    .from("audit_logs")
    .select("id, diff, created_at, actor:profiles(full_name)")
    .eq("entity_type", "product")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="spec-label text-muted-foreground">{editor.divisionName}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{editor.initial.name}</h1>
        </div>
        <Link href={`/p/${editor.slug}`} className="text-sm underline underline-offset-4">
          View in the shop
        </Link>
      </div>

      <ProductForm
        initial={editor.initial}
        materials={editor.materials}
        pricingModel={editor.pricingModel}
        supportsVariableData={editor.supportsVariableData}
        globalTiers={editor.globalTiers}
        currencySymbol={SYMBOL[editor.currency]}
      />

      {history && history.length > 0 ? (
        <section className="bg-card grid gap-2 rounded-xl border p-5 text-sm">
          <h2 className="text-base font-semibold">Recent changes</h2>
          <ol className="grid gap-1.5" data-testid="product-history">
            {history.map((h) => {
              const diff = h.diff as {
                fields?: Record<string, { from: unknown; to: unknown }>;
                materials?: unknown;
                tiers?: unknown;
              };
              const parts = [
                ...Object.entries(diff.fields ?? {}).map(
                  ([field, change]) =>
                    `${field.replaceAll("_", " ")} ${String(change.from)} → ${String(change.to)}`,
                ),
                ...(diff.materials ? ["materials"] : []),
                ...(diff.tiers ? ["discount tiers"] : []),
              ];
              return (
                <li key={h.id} className="flex flex-wrap justify-between gap-x-4">
                  <span>{parts.length > 0 ? parts.join("; ") : "Saved without changes"}</span>
                  <span className="text-muted-foreground">
                    {h.actor?.full_name ?? "Admin"} ·{" "}
                    {new Date(h.created_at).toLocaleString("en-GB")}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
