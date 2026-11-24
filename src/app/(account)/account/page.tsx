import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { orderStatusLabel } from "@/domain/order-status";
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
  const [
    { data: orders },
    { count: designCount },
    { data: awaitingProofs },
    { data: allStatuses },
    { data: repeatable },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_number, status, approved_proof_id, total_gross_minor, currency, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("designs").select("id", { count: "exact", head: true }),
    // Proofs waiting for the customer's decision (PRD p9 §13: active proofs).
    supabase
      .from("orders")
      .select("id, order_number, order_items(description)")
      .eq("status", "proof")
      .is("approved_proof_id", null)
      .order("created_at", { ascending: false }),
    // Order counts per stage for the summary tiles.
    supabase.from("orders").select("status").limit(1000),
    // Approved jobs the customer can repeat in one click (DECISIONS D-12).
    supabase
      .from("orders")
      .select("id, order_number, created_at, order_items(description)")
      .not("approved_proof_id", "is", null)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);
  const count = (statuses: string[]) =>
    (allStatuses ?? []).filter((o) => statuses.includes(o.status)).length;
  const tiles = [
    {
      label: "In progress",
      value: count(["order", "artwork", "proof", "production"]),
      href: "/account/orders?show=active",
    },
    { label: "Awaiting payment", value: count(["quote"]), href: "/account/orders?show=unpaid" },
    { label: "Completed", value: count(["completed"]), href: "/account/orders?show=completed" },
  ];

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

      <ul className="grid grid-cols-3 gap-3" data-testid="order-summary">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link
              href={tile.href}
              className="bg-card hover:border-ink grid gap-1 rounded-xl border p-4 transition-colors"
            >
              <span className="num font-mono text-2xl font-semibold">{tile.value}</span>
              <span className="text-muted-foreground text-xs sm:text-sm">{tile.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      {awaitingProofs && awaitingProofs.length > 0 ? (
        <Card className="border-signal" data-testid="active-proofs">
          <CardHeader>
            <CardTitle>Proofs waiting for you</CardTitle>
            <CardDescription>
              Nothing is printed until you approve. Check each proof and approve it or ask for
              changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {awaitingProofs.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <span className="grid">
                    <span className="font-mono text-sm">{order.order_number}</span>
                    <span className="text-muted-foreground text-sm">
                      {order.order_items[0]?.description}
                    </span>
                  </span>
                  <Link
                    href={`/account/orders/${order.id}#proof`}
                    className={buttonVariants({ size: "sm" })}
                  >
                    Review proof
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

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
          <CardContent>
            <Link href="/account/designs" className={buttonVariants({ variant: "outline" })}>
              View designs
            </Link>
          </CardContent>
        </Card>
      </div>

      {repeatable && repeatable.length > 0 ? (
        <Card data-testid="order-again">
          <CardHeader>
            <CardTitle>Order again</CardTitle>
            <CardDescription>
              Repeat an approved job at today&rsquo;s price, with no new proof to wait for.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {repeatable.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <span className="grid">
                    <span className="font-mono text-sm">{order.order_number}</span>
                    <span className="text-muted-foreground text-sm">
                      {order.order_items[0]?.description}
                    </span>
                  </span>
                  <Link
                    href={`/account/orders/${order.id}#reorder`}
                    className={buttonVariants({ size: "sm", variant: "outline" })}
                  >
                    Reorder
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

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
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="font-mono text-sm underline-offset-4 hover:underline"
                  >
                    {order.order_number}
                  </Link>
                  <span className="text-muted-foreground text-sm">
                    {orderStatusLabel(order.status, Boolean(order.approved_proof_id))}
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
