import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { RoleControl } from "@/components/admin/admin-controls";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { orderStatusLabel } from "@/domain/order-status";
import { requireAdmin } from "@/server/auth";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "User (admin)" };

type Props = { params: Promise<{ id: string }> };

export default function AdminUserPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminUser {...props} />
    </Suspense>
  );
}

async function AdminUser({ params }: Props) {
  const { id } = await params;
  const admin = await requireAdmin(`/admin/users/${id}`);
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createSupabaseServerClient(); // RLS: admins read every profile/order
  const [{ data: profile }, { data: orders }, { data: roleLog }, { data: authUser }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, company_name, phone, role, marketing_opt_in, created_at")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("orders")
        .select(
          "id, order_number, status, approved_proof_id, total_gross_minor, currency, created_at, archived_at, order_items(description)",
        )
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("audit_logs")
        .select("id, diff, created_at, actor:profiles(full_name)")
        .eq("entity_type", "profile")
        .eq("entity_id", id)
        .eq("action", "user.role_changed")
        .order("created_at", { ascending: false })
        .limit(20),
      createSupabaseAdminClient().auth.admin.getUserById(id),
    ]);
  if (!profile) notFound();
  const isSelf = admin.id === profile.id;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="spec-label text-muted-foreground">User</p>
        <h1 className="text-2xl font-semibold tracking-tight">{profile.full_name ?? "No name"}</h1>
        <p className="text-muted-foreground text-sm">{authUser.user?.email}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-card grid content-start gap-2 rounded-xl border p-5 text-sm">
          <h2 className="text-base font-semibold">Details</h2>
          <dl className="grid gap-1.5">
            <Row label="Company" value={profile.company_name ?? "Not provided"} />
            <Row label="Phone" value={profile.phone ?? "Not provided"} />
            <Row label="Joined" value={new Date(profile.created_at).toLocaleDateString("en-GB")} />
            <Row label="Marketing" value={profile.marketing_opt_in ? "Opted in" : "No"} />
          </dl>
        </section>
        <section
          className="bg-card grid content-start gap-3 rounded-xl border p-5 text-sm"
          data-testid="user-role"
        >
          <h2 className="text-base font-semibold">Role</h2>
          <p>
            {profile.role === "admin"
              ? "Admin: can see every order and run production."
              : "Customer: sees only their own orders."}
          </p>
          {isSelf ? (
            <p className="text-muted-foreground">You cannot change your own role.</p>
          ) : (
            <RoleControl userId={profile.id} role={profile.role} />
          )}
          {roleLog && roleLog.length > 0 ? (
            <ul className="text-muted-foreground grid gap-1">
              {roleLog.map((entry) => {
                const diff = entry.diff as { from?: string; to?: string };
                return (
                  <li key={entry.id}>
                    {diff.from} → {diff.to} by {entry.actor?.full_name ?? "an admin"},{" "}
                    {new Date(entry.created_at).toLocaleString("en-GB")}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      </div>

      <section className="grid gap-3" aria-labelledby="user-orders">
        <h2 id="user-orders" className="text-lg font-semibold">
          Orders ({orders?.length ?? 0})
        </h2>
        {!orders || orders.length === 0 ? (
          <p className="text-muted-foreground text-sm">No orders.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="hover:bg-muted grid gap-1 p-4 text-sm md:grid-cols-[9rem_1fr_10rem_7rem] md:items-center md:gap-4"
                >
                  <span className="num font-mono">{order.order_number}</span>
                  <span className="truncate">{order.order_items[0]?.description}</span>
                  <span className="text-muted-foreground">
                    {orderStatusLabel(order.status, Boolean(order.approved_proof_id))}
                    {order.archived_at ? " · archived" : ""}
                  </span>
                  <span className="num font-mono md:text-right">
                    {formatMinor(order.total_gross_minor, order.currency as CurrencyCode)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
