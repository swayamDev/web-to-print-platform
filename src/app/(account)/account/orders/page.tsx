import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { orderFilter, ORDER_FILTERS, orderStatusLabel } from "@/domain/order-status";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Orders" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function OrdersPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OrdersList {...props} />
    </Suspense>
  );
}

async function OrdersList({ searchParams }: Props) {
  await requireUser("/account/orders");
  const query = await searchParams;
  const filter = orderFilter(typeof query.show === "string" ? query.show : undefined);
  const supabase = await createSupabaseServerClient();
  // RLS: only this customer's orders.
  let request = supabase
    .from("orders")
    .select(
      "id, order_number, status, approved_proof_id, invoice_number, total_gross_minor, currency, created_at, order_items(description)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter.statuses) request = request.in("status", filter.statuses);
  const { data: orders } = await request;

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>

      <nav aria-label="Filter orders" className="flex flex-wrap gap-2">
        {ORDER_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/account/orders" : `/account/orders?show=${f.key}`}
            aria-current={f.key === filter.key ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              f.key === filter.key ? "border-ink bg-ink text-paper" : "hover:border-ink",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {!orders || orders.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
          {filter.key === "all"
            ? "No orders yet. Design something and choose “Order now”."
            : "No orders here."}
        </p>
      ) : (
        <ul className="grid gap-3" data-testid="order-list">
          {orders.map((order) => {
            const approved = Boolean(order.approved_proof_id);
            return (
              <li
                key={order.id}
                className="bg-card hover:border-ink relative grid gap-1 rounded-xl border p-4 transition-colors sm:grid-cols-[auto_1fr_auto_auto] sm:items-center sm:gap-4"
              >
                <Link
                  href={`/account/orders/${order.id}`}
                  className="num font-mono text-sm after:absolute after:inset-0 after:rounded-xl"
                >
                  {order.order_number}
                </Link>
                <span className="text-sm">{order.order_items[0]?.description}</span>
                <span className="text-muted-foreground text-sm">
                  {orderStatusLabel(order.status, approved)} ·{" "}
                  {new Date(order.created_at).toLocaleDateString("en-GB")}
                </span>
                <span className="num font-mono text-sm">
                  {formatMinor(order.total_gross_minor, order.currency as CurrencyCode)}
                </span>
                {order.invoice_number || (approved && order.status !== "cancelled") ? (
                  // Links sit above the card's stretched link, so they stay clickable.
                  <span className="relative z-10 flex flex-wrap gap-4 text-sm sm:col-span-4">
                    {order.invoice_number ? (
                      <a
                        href={`/api/v1/invoices/${order.id}`}
                        className="underline underline-offset-4"
                      >
                        Invoice {order.invoice_number}
                      </a>
                    ) : null}
                    {approved && order.status !== "cancelled" ? (
                      <Link
                        href={`/account/orders/${order.id}#reorder`}
                        className="underline underline-offset-4"
                      >
                        Reorder
                      </Link>
                    ) : null}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
