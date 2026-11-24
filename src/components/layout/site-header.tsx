import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { ProductDisclosure } from "@/components/layout/product-disclosure";
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
    <header className="bg-card sticky top-0 z-40 border-b">
      <div className="group/header mx-auto flex h-14 w-full max-w-[96rem] items-center justify-between gap-1 px-4 sm:gap-3 md:px-8">
        <Logo />
        <nav aria-label="Catalogue" className="flex items-center gap-1 md:gap-4">
          <ProductsMenu />
          <Link href="/gallery" className={buttonVariants({ variant: "ghost", className: "hidden md:inline-flex" })}>
            Gallery
          </Link>
        </nav>
        <Suspense fallback={<div className="bg-muted h-8 w-28 motion-safe:animate-pulse rounded-md" aria-hidden="true" />}>
          <AccountNav />
        </Suspense>
      </div>
    </header>
  );
}

/** Products menu built with <details>, so it works without JavaScript and on touch. */
async function ProductsMenu() {
  const divisions = await getDivisions();
  return (
    <ProductDisclosure>
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
        <div className="mt-1 border-t pt-1">
          <Link
            href="/gallery"
            className="hover:bg-muted flex items-center justify-between rounded-md px-3 py-2 text-sm"
          >
            Gallery
            <span className="spec-label text-muted-foreground">Work</span>
          </Link>
        </div>
    </ProductDisclosure>
  );
}

/** Narrower buttons on phones, so an admin's four header buttons fit at 360 px. */
const TIGHT = "max-sm:px-1.5";

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
        <Link
          href="/admin"
          data-admin-link
          className={buttonVariants({ variant: "ghost", className: TIGHT })}
        >
          Admin
        </Link>
      ) : null}
      <Link href="/account" className={buttonVariants({ variant: "ghost", className: TIGHT })}>
        <span className="max-sm:hidden">My account</span>
        <span className="sm:hidden">Account</span>
      </Link>
      <form action={logoutAction}>
        <button type="submit" className={buttonVariants({ variant: "outline", className: TIGHT })}>
          Log out
        </button>
      </form>
    </nav>
  );
}
