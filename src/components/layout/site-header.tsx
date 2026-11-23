import { Menu } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { getSessionUser } from "@/server/auth";
import { logoutAction } from "@/server/actions/auth";
import { getDivisions } from "@/server/catalogue";

/**
 * Top bar on every page. Brand and product links are cached; the account links depend on
 * the session cookie, so they stream in inside a Suspense boundary (Cache Components).
 */
export function SiteHeader() {
  return (
    <header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4">
        <Logo />
        <div className="flex items-center gap-1">
          <ProductsMenu />
          <Suspense fallback={<div className="bg-muted h-8 w-32 animate-pulse rounded-md" />}>
            <AccountNav />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

/** Products menu built with <details>, so it works without JavaScript and on touch. */
async function ProductsMenu() {
  const divisions = await getDivisions();
  return (
    <details className="group relative">
      <summary
        className={`${buttonVariants({ variant: "ghost" })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        <Menu className="size-4 md:hidden" aria-hidden="true" />
        <span className="max-md:sr-only">Products</span>
      </summary>
      <div className="bg-popover absolute right-0 mt-2 w-64 rounded-lg border p-1 shadow-lg md:left-0">
        <ul>
          {divisions.map((division) => (
            <li key={division.id}>
              <Link
                href={`/d/${division.slug}`}
                className="hover:bg-muted flex items-center justify-between rounded-md px-3 py-2 text-sm"
              >
                {division.name}
                <span className="spec-label text-muted-foreground">
                  {String(division.sortOrder).padStart(2, "0")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

async function AccountNav() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <nav aria-label="Account" className="flex items-center gap-1">
        <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
          Log in
        </Link>
        <Link href="/signup" className={buttonVariants()}>
          Sign up
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Account" className="flex items-center gap-1">
      {user.profile.role === "admin" ? (
        <Link href="/admin" className={buttonVariants({ variant: "ghost" })}>
          Admin
        </Link>
      ) : null}
      <Link href="/account" className={buttonVariants({ variant: "ghost" })}>
        <span className="max-sm:hidden">My account</span>
        <span className="sm:hidden">Account</span>
      </Link>
      <form action={logoutAction}>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Log out
        </button>
      </form>
    </nav>
  );
}
