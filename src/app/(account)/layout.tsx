import type { Metadata } from "next";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import { SectionNav } from "@/components/layout/section-nav";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const NAV = [
  { href: "/account", label: "Dashboard", exact: true },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/designs", label: "Designs" },
  { href: "/account/profile", label: "Profile" },
];

/** Signed-in customer area. Every page below is checked on the server. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-6 px-4 py-6">
      {/* The nav reads the current URL, which dynamic routes only know at request time. */}
      <Suspense fallback={<div className="h-10 border-b" aria-hidden="true" />}>
        <SectionNav items={NAV} label="Account sections" />
      </Suspense>
      <Suspense fallback={<PageSkeleton />}>
        <SignedIn>{children}</SignedIn>
      </Suspense>
    </div>
  );
}

async function SignedIn({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
