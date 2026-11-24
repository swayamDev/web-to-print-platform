import type { Metadata } from "next";
import { Suspense } from "react";

import { TemplateEditor } from "@/components/admin/catalogue-controls";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { requireAdmin } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Templates (admin)" };

/**
 * Design templates per product (PRD p9 §14 "template groups"): name, group, order and whether
 * customers see them. Saved designs keep their own copy, so hiding a template never breaks them.
 */
export default function AdminTemplatesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminTemplates />
    </Suspense>
  );
}

async function AdminTemplates() {
  await requireAdmin("/admin/templates");
  const supabase = await createSupabaseServerClient(); // RLS: admins read hidden templates too
  const { data: products } = await supabase
    .from("products")
    .select(
      "id, name, sort_order, division:divisions(sort_order), templates(id, name, group_name, description, sort_order, is_active)",
    )
    .order("sort_order");
  const sorted = [...(products ?? [])]
    .filter((p) => p.templates.length > 0)
    .sort(
      (a, b) =>
        (a.division?.sort_order ?? 0) - (b.division?.sort_order ?? 0) ||
        a.sort_order - b.sort_order,
    );

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
      {sorted.map((product) => (
        <section key={product.id} className="grid gap-3" aria-label={product.name}>
          <h2 className="text-lg font-semibold">{product.name}</h2>
          <ul className="grid gap-3">
            {[...product.templates]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((t) => (
                <li
                  key={t.id}
                  className="bg-card grid gap-4 rounded-xl border p-4 sm:grid-cols-[8rem_1fr]"
                  data-testid={`template-${t.id}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered SVG preview */}
                  <img
                    src={`/api/v1/templates/${t.id}/preview?dpi=36&guides=0`}
                    alt={`Preview of ${t.name}`}
                    className="bg-muted w-32 rounded border"
                    loading="lazy"
                  />
                  <TemplateEditor
                    template={{
                      id: t.id,
                      name: t.name,
                      groupName: t.group_name,
                      description: t.description,
                      sortOrder: t.sort_order,
                      isActive: t.is_active,
                    }}
                  />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
