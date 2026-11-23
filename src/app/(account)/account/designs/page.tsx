import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { DeleteDesignButton } from "@/components/account/delete-design-button";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { formatMm } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { listOwnDesigns } from "@/server/designs";

export const metadata: Metadata = { title: "Saved designs" };

export default function DesignsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DesignsList />
    </Suspense>
  );
}

async function DesignsList() {
  await requireUser("/account/designs");
  const designs = await listOwnDesigns();

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Saved designs</h1>
          <p className="text-muted-foreground text-sm">Reopen a design to keep editing it.</p>
        </div>
        <Link href="/#products" className={buttonVariants({ variant: "outline" })}>
          Start a new design
        </Link>
      </div>

      {designs.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
          No saved designs yet. Pick a product, choose “Design online” and save your work.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="design-list">
          {designs.map((design) => (
            <li key={design.id} className="bg-card grid gap-3 rounded-xl border p-4">
              <div className="grid gap-1">
                <Link
                  href={`/design/${design.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {design.name}
                </Link>
                <p className="text-muted-foreground text-sm">
                  {design.productName} · {formatMm(design.widthMm)} × {formatMm(design.heightMm)} mm
                </p>
                <p className="spec-label text-muted-foreground">
                  Edited{" "}
                  {new Date(design.updatedAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {design.isLocked ? " · Locked (approved)" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/design/${design.id}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Open
                </Link>
                {design.isLocked ? null : (
                  <DeleteDesignButton designId={design.id} name={design.name} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
