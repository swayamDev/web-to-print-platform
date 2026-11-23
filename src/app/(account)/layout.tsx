import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import { SectionNav } from "@/components/layout/section-nav";
import { requireUser } from "@/server/auth";

const NAV = [
  { href: "/account", label: "Dashboard", exact: true },
  { href: "/account/profile", label: "Profile" },
];

/** Signed-in customer area. Every page below is checked on the server. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-6 px-4 py-6">
      <SectionNav items={NAV} label="Account sections" />
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
