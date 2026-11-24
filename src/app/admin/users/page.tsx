import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { cn } from "@/lib/utils";
import { USERS_PER_PAGE, userDirectory } from "@/server/admin";
import { requireAdmin } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Users (admin)" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Manage users (D-17): list and search, see their orders, change role. */
export default function AdminUsersPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminUsers {...props} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function AdminUsers({ searchParams }: Props) {
  const admin = await requireAdmin("/admin/users");
  const raw = await searchParams;
  const query = one(raw.q).trim().slice(0, 100);
  const role =
    one(raw.role) === "admin" ? "admin" : one(raw.role) === "customer" ? "customer" : undefined;
  const page = Math.max(1, Math.min(1000, Number.parseInt(one(raw.page) || "1", 10) || 1));
  const [{ users, total }, settings] = await Promise.all([
    userDirectory(admin.id, { query, role, page }),
    (await createSupabaseServerClient()).from("settings").select("currency").single(),
  ]);
  const currency = (settings.data?.currency ?? "GBP") as CurrencyCode;
  const pages = Math.max(1, Math.ceil(total / USERS_PER_PAGE));
  const href = (p: { role?: string; page?: number }) => {
    const s = new URLSearchParams();
    if (query) s.set("q", query);
    if (p.role) s.set("role", p.role);
    if (p.page && p.page > 1) s.set("page", String(p.page));
    const qs = s.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <form action="/admin/users" className="flex w-full gap-2 sm:w-auto" role="search">
          {role ? <input type="hidden" name="role" value={role} /> : null}
          <label htmlFor="user-search" className="sr-only">
            Search users
          </label>
          <input
            id="user-search"
            name="q"
            defaultValue={query}
            placeholder="Name, company or email"
            className="bg-background h-10 w-full min-w-0 rounded-md border px-3 text-sm sm:w-72"
          />
          <button type="submit" className="bg-ink text-paper h-10 rounded-md px-4 text-sm">
            Search
          </button>
        </form>
      </div>

      <nav aria-label="Filter by role" className="flex flex-wrap gap-2">
        {[
          { label: "Everyone", value: undefined },
          { label: "Customers", value: "customer" },
          { label: "Admins", value: "admin" },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={href({ role: tab.value })}
            aria-current={role === tab.value ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              role === tab.value ? "border-ink bg-ink text-paper" : "hover:border-ink",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <p className="text-muted-foreground text-sm">
        {total} {total === 1 ? "user" : "users"}
        {query ? ` matching “${query}”` : ""}
      </p>

      {users.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
          No users match.
        </p>
      ) : (
        <ul className="grid gap-2" data-testid="admin-user-list">
          {users.map((user) => (
            <li key={user.id}>
              <Link
                href={`/admin/users/${user.id}`}
                className="bg-card hover:border-ink grid gap-1 rounded-xl border p-4 transition-colors md:grid-cols-[1fr_6rem_7rem_8rem] md:items-center md:gap-4"
              >
                <span className="grid min-w-0 text-sm">
                  <span className="truncate font-medium">
                    {user.fullName ?? "No name"}
                    {user.companyName ? ` · ${user.companyName}` : ""}
                  </span>
                  <span className="text-muted-foreground truncate">{user.email}</span>
                </span>
                <span className="text-sm">{user.role === "admin" ? "Admin" : "Customer"}</span>
                <span className="text-muted-foreground text-sm">
                  {user.orderCount} {user.orderCount === 1 ? "order" : "orders"}
                </span>
                <span className="num font-mono text-sm md:text-right">
                  {formatMinor(user.paidTotalMinor, currency)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href({ role, page: page - 1 })} className="underline">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={href({ role, page: page + 1 })} className="underline">
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
