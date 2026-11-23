import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { getSessionUser } from "@/server/auth";
import { logoutAction } from "@/server/actions/auth";

/**
 * Top bar shown on every page. The brand is static; the account links depend on the
 * session cookie, so they stream in inside a Suspense boundary (Cache Components).
 * Restyled with the design system in Phase 3.
 */
export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          Digital Heroes <span className="text-muted-foreground">Print</span>
        </Link>
        <Suspense fallback={<div className="bg-muted h-8 w-40 animate-pulse rounded-lg" />}>
          <AccountNav />
        </Suspense>
      </div>
    </header>
  );
}

async function AccountNav() {
  const user = await getSessionUser();

  return (
    <nav aria-label="Account" className="flex items-center gap-2 text-sm">
      {user ? (
        <>
          {user.profile.role === "admin" ? (
            <Link href="/admin" className={buttonVariants({ variant: "ghost" })}>
              Admin
            </Link>
          ) : null}
          <Link href="/account" className={buttonVariants({ variant: "ghost" })}>
            My account
          </Link>
          <form action={logoutAction}>
            <button type="submit" className={buttonVariants({ variant: "outline" })}>
              Log out
            </button>
          </form>
        </>
      ) : (
        <>
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
            Log in
          </Link>
          <Link href="/signup" className={buttonVariants()}>
            Sign up
          </Link>
        </>
      )}
    </nav>
  );
}
