import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import {
  looksLikeOrderNumber,
  parseQueueParams,
  QUEUE_PAGE_SIZE,
  queueHref,
  sanitizeSearch,
  type QueueParams,
} from "@/domain/admin-queue";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, orderStatusLabel } from "@/domain/order-status";
import { cn } from "@/lib/utils";
import { userDirectory } from "@/server/admin";
import { requireAdmin } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Orders (admin)" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The admin order queue (PRD p8 §11–12): every job, filtered by stage, searchable. */
export default function AdminOrdersPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminOrders {...props} />
    </Suspense>
  );
}

async function AdminOrders({ searchParams }: Props) {
  const admin = await requireAdmin("/admin/orders");
  const params = parseQueueParams(await searchParams);
  const supabase = await createSupabaseServerClient(); // RLS: admins read every order

  let request = supabase
    .from("orders")
    .select(
      `id, order_number, status, approved_proof_id, total_gross_minor, currency, created_at, paid_at,
       archived_at, reorder_of_order_id,
       customer:profiles!orders_customer_id_fkey(full_name, company_name),
       order_items(description, is_variable_data)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((params.page - 1) * QUEUE_PAGE_SIZE, params.page * QUEUE_PAGE_SIZE - 1);

  if (params.view === "active") request = request.is("archived_at", null);
  if (params.view === "archived") request = request.not("archived_at", "is", null);
  if (params.awaitingFiles) {
    request = request.eq("status", "proof").not("approved_proof_id", "is", null);
  } else if (params.status) {
    request = request.eq("status", params.status);
  }

  let noMatches = false;
  if (params.query) {
    if (looksLikeOrderNumber(params.query)) {
      request = request.ilike("order_number", `%${sanitizeSearch(params.query)}%`);
    } else {
      // Customer name, company or email: find the people first (emails live in auth.users).
      // The query goes to the database as a parameter, so it needs no escaping.
      const { users } = await userDirectory(admin.id, { query: params.query, limit: 200 });
      if (users.length === 0) noMatches = true;
      else
        request = request.in(
          "customer_id",
          users.map((u) => u.id),
        );
    }
  }
  const { data, count } = noMatches ? { data: [], count: 0 } : await request;
  const orders = data ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / QUEUE_PAGE_SIZE));

  const tabs: { label: string; params: Partial<QueueParams> }[] = [
    { label: "All stages", params: {} },
    ...ORDER_STATUSES.map((status) => ({
      label: ORDER_STATUS_LABELS[status],
      params: { status },
    })),
    { label: "Approved, needs files", params: { awaitingFiles: true } },
  ];
  const isCurrent = (p: Partial<QueueParams>) =>
    (p.status ?? null) === (params.awaitingFiles ? null : params.status) &&
    Boolean(p.awaitingFiles) === params.awaitingFiles;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <form action="/admin/orders" className="flex w-full gap-2 sm:w-auto" role="search">
          {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
          {params.view !== "active" ? (
            <input type="hidden" name="view" value={params.view} />
          ) : null}
          <label htmlFor="order-search" className="sr-only">
            Search orders
          </label>
          <input
            id="order-search"
            name="q"
            defaultValue={params.query}
            placeholder="Order number, customer, company or email"
            className="bg-background h-10 w-full min-w-0 rounded-md border px-3 text-sm sm:w-80"
          />
          <button type="submit" className="bg-ink text-paper h-10 rounded-md px-4 text-sm">
            Search
          </button>
        </form>
      </div>

      <nav aria-label="Filter by stage" className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={queueHref({ ...tab.params, view: params.view, query: params.query })}
            aria-current={isCurrent(tab.params) ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              isCurrent(tab.params) ? "border-ink bg-ink text-paper" : "hover:border-ink",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground" data-testid="queue-count">
          {count ?? 0} {count === 1 ? "order" : "orders"}
          {params.query ? ` matching “${params.query}”` : ""}
        </p>
        <nav aria-label="Archive" className="flex gap-3">
          {(["active", "archived", "all"] as const).map((view) => (
            <Link
              key={view}
              href={queueHref({ ...params, view, page: 1 })}
              aria-current={params.view === view ? "page" : undefined}
              className={cn(
                "underline-offset-4",
                params.view === view ? "font-semibold underline" : "hover:underline",
              )}
            >
              {view === "active" ? "Active" : view === "archived" ? "Archived" : "Everything"}
            </Link>
          ))}
        </nav>
      </div>

      {orders.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
          No orders match these filters.
        </p>
      ) : (
        <ul className="grid gap-2" data-testid="admin-order-list">
          {orders.map((order) => {
            const item = order.order_items[0];
            return (
              <li key={order.id}>
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="bg-card hover:border-ink grid gap-1 rounded-xl border p-4 transition-colors md:grid-cols-[9rem_1fr_12rem_8rem_7rem] md:items-center md:gap-4"
                >
                  <span className="num font-mono text-sm">{order.order_number}</span>
                  <span className="grid min-w-0 text-sm">
                    <span className="truncate">{item?.description}</span>
                    <span className="text-muted-foreground truncate">
                      {order.customer?.full_name ?? "Customer"}
                      {order.customer?.company_name ? ` · ${order.customer.company_name}` : ""}
                      {item?.is_variable_data ? " · CSV" : ""}
                      {order.reorder_of_order_id ? " · Reorder" : ""}
                    </span>
                  </span>
                  <span className="text-sm">
                    {orderStatusLabel(order.status, Boolean(order.approved_proof_id))}
                    {order.archived_at ? " · archived" : ""}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {new Date(order.created_at).toLocaleDateString("en-GB")}
                  </span>
                  <span className="num font-mono text-sm md:text-right">
                    {formatMinor(order.total_gross_minor, order.currency as CurrencyCode)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {params.page > 1 ? (
            <Link href={queueHref({ ...params, page: params.page - 1 })} className="underline">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {params.page} of {pages}
          </span>
          {params.page < pages ? (
            <Link href={queueHref({ ...params, page: params.page + 1 })} className="underline">
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
