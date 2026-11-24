import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import { orderStatusLabel } from "@/domain/order-status";
import { requireAdmin } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Production" };

/**
 * Production queue: approved proofs waiting for print files, and jobs in production.
 * (The full admin order queue with filters arrives with the admin console.)
 */
export default function ProductionPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductionQueue />
    </Suspense>
  );
}

async function ProductionQueue() {
  await requireAdmin("/admin/production");
  const supabase = await createSupabaseServerClient(); // RLS: admins read every order

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, approved_proof_id, files_unlocked_at, order_items(description), production_files(id)",
    )
    .in("status", ["proof", "production"])
    .is("archived_at", null)
    .order("files_unlocked_at", { ascending: true, nullsFirst: false });

  const ready = (orders ?? []).filter((o) => o.status === "proof" && o.approved_proof_id);
  const running = (orders ?? []).filter((o) => o.status === "production");

  return (
    <div className="grid gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Production</h1>
      <Queue
        title="Approved, waiting for print files"
        empty="No approved proofs are waiting."
        orders={ready}
        testId="queue-ready"
      />
      <Queue
        title="In production"
        empty="Nothing is in production."
        orders={running}
        testId="queue-running"
      />
    </div>
  );
}

function Queue({
  title,
  empty,
  orders,
  testId,
}: {
  title: string;
  empty: string;
  testId: string;
  orders: {
    id: string;
    order_number: string;
    status: "proof" | "production" | string;
    approved_proof_id: string | null;
    files_unlocked_at: string | null;
    order_items: { description: string }[];
    production_files: { id: string }[];
  }[];
}) {
  return (
    <section className="grid gap-3" aria-label={title} data-testid={testId}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {orders.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {orders.map((order) => (
            <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span className="grid min-w-0">
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="font-mono text-sm underline-offset-4 hover:underline"
                >
                  {order.order_number}
                </Link>
                <span className="text-muted-foreground truncate text-sm">
                  {order.order_items[0]?.description}
                </span>
              </span>
              <span className="text-muted-foreground text-sm">
                {orderStatusLabel(
                  order.status as "proof" | "production",
                  Boolean(order.approved_proof_id),
                )}
                {order.files_unlocked_at
                  ? ` · approved ${new Date(order.files_unlocked_at).toLocaleDateString("en-GB")}`
                  : ""}
                {order.production_files.length > 0
                  ? ` · ${order.production_files.length} files`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
