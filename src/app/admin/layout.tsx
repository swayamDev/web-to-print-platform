import type { Metadata } from "next";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import { SectionNav } from "@/components/layout/section-nav";
import { requireAdmin } from "@/server/auth";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const NAV = [{ href: "/admin", label: "Overview", exact: true }];

/**
 * Administrator console. requireAdmin() here protects every page below it, and each admin
 * server action and route handler must call requireAdmin() itself as well.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-6 px-4 py-6">
      <Suspense fallback={<PageSkeleton />}>
        <AdminOnly>
          <SectionNav items={NAV} label="Admin sections" />
          {children}
        </AdminOnly>
      </Suspense>
    </div>
  );
}

async function AdminOnly({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
