import Link from "next/link";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@/domain/order-status";
import { requireAdmin } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase/server";

/** Admin overview: live counts from the database (RLS lets admins read every order). */
export default function AdminOverviewPage() {
  // Data is read at request time, so it streams in behind a placeholder (Cache Components).
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminOverview />
    </Suspense>
  );
}

async function AdminOverview() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: orders }, { count: customerCount }, { data: settings }] = await Promise.all([
    supabase.from("orders").select("status, total_gross_minor, paid_at").is("archived_at", null),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
    supabase.from("settings").select("currency").single(),
  ]);

  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<
    OrderStatus,
    number
  >;
  let revenueMinor = 0;
  for (const order of orders ?? []) {
    counts[order.status] += 1;
    if (order.paid_at) revenueMinor += order.total_gross_minor;
  }
  const currency = (settings?.currency ?? "GBP") as CurrencyCode;

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Revenue (paid, active orders, incl. tax)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMinor(revenueMinor, currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Customers</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{customerCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <section aria-labelledby="pipeline-heading" className="grid gap-3">
        <h2 id="pipeline-heading" className="text-lg font-semibold">
          Pipeline
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {ORDER_STATUSES.map((status) => (
            <li key={status}>
              <Link
                href={`/admin/orders?status=${status}`}
                className="hover:border-ink block rounded-lg border p-3 transition-colors"
              >
                <p className="text-muted-foreground text-xs">{ORDER_STATUS_LABELS[status]}</p>
                <p className="text-xl font-semibold tabular-nums">{counts[status]}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
