import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { ORDER_STATUS_LABELS } from "@/domain/order-status";
import { requireUser } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "My account" };

export default function AccountDashboardPage() {
  // Data is read at request time, so it streams in behind a placeholder (Cache Components).
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AccountDashboard />
    </Suspense>
  );
}

async function AccountDashboard() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // RLS limits both queries to this customer's own rows.
  const [{ data: orders }, { count: designCount }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, status, total_gross_minor, currency, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("designs").select("id", { count: "exact", head: true }),
  ]);

  const { full_name, company_name, phone } = user.profile;
  const missing = [!full_name && "name", !company_name && "company", !phone && "phone"].filter(
    Boolean,
  );

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hello{full_name ? `, ${full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm">{user.email}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              {missing.length === 0
                ? "Your details are complete."
                : `Add your ${missing.join(", ")} so we can reach you about proofs.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/account/profile" className={buttonVariants({ variant: "outline" })}>
              Edit profile
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saved designs</CardTitle>
            <CardDescription>
              {designCount
                ? `You have ${designCount} saved design${designCount === 1 ? "" : "s"}.`
                : "Designs you save in the designer will appear here."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent orders</CardTitle>
          <CardDescription>Your latest orders and where they are in production.</CardDescription>
        </CardHeader>
        <CardContent>
          {orders && orders.length > 0 ? (
            <ul className="divide-y">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <span className="font-mono text-sm">{order.order_number}</span>
                  <span className="text-muted-foreground text-sm">
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                  <span className="text-sm tabular-nums">
                    {formatMinor(order.total_gross_minor, order.currency as CurrencyCode)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              No orders yet. Once you order, you can track it here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
