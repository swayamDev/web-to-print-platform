import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { ORDER_STATUS_LABELS } from "@/domain/order-status";
import { requireUser } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OrdersList />
    </Suspense>
  );
}

async function OrdersList() {
  await requireUser("/account/orders");
  const supabase = await createSupabaseServerClient();
  // RLS: only this customer's orders.
  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total_gross_minor, currency, created_at, order_items(description)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
      {!orders || orders.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
          No orders yet. Design something and choose “Order now”.
        </p>
      ) : (
        <ul className="grid gap-3" data-testid="order-list">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/account/orders/${order.id}`}
                className="bg-card hover:border-ink grid gap-1 rounded-xl border p-4 transition-colors sm:grid-cols-[auto_1fr_auto_auto] sm:items-center sm:gap-4"
              >
                <span className="num font-mono text-sm">{order.order_number}</span>
                <span className="text-sm">{order.order_items[0]?.description}</span>
                <span className="text-muted-foreground text-sm">
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
                <span className="num font-mono text-sm">
                  {formatMinor(order.total_gross_minor, order.currency as CurrencyCode)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
