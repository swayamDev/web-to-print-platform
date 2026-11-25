import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { cn } from "@/lib/utils";
import { getDivisions } from "@/server/catalogue";
import { getGallery } from "@/server/gallery";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Sample work from every division, rendered by our print engine.",
  alternates: { canonical: "/gallery" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Gallery of work by product family, filterable by division (PRD R-45). */
export default function GalleryPage(props: Props) {
  return (
    <main className="mx-auto grid w-full max-w-[96rem] gap-7 px-4 py-7 md:gap-9 md:px-8 md:py-10 lg:px-12">
      <header className="grid gap-3 border-b pb-6">
        <h1 className="text-4xl font-bold md:text-5xl">Made on this platform</h1>
        <p className="text-muted-foreground max-w-2xl">
          Browse sample designs rendered by the print engine. Filter by product division.
        </p>
      </header>
      <Suspense fallback={<PageSkeleton />}>
        <GalleryContent {...props} />
      </Suspense>
    </main>
  );
}

async function GalleryContent({ searchParams }: Props) {
  const raw = (await searchParams).division;
  const [divisions, all] = await Promise.all([getDivisions(), getGallery()]);
  const selected = divisions.find((d) => d.slug === (Array.isArray(raw) ? raw[0] : raw)) ?? null;
  const items = selected ? all.filter((i) => i.division.slug === selected.slug) : all;
  const withItems = divisions.filter((d) => all.some((i) => i.division.slug === d.slug));

  return (
    <div className="grid gap-6">
      <nav aria-label="Filter by division" className="flex flex-wrap gap-2">
        {[{ slug: null, name: "All work" }, ...withItems].map((d) => {
          const current = (selected?.slug ?? null) === d.slug;
          return (
            <Link
              key={d.slug ?? "all"}
              href={d.slug ? `/gallery?division=${d.slug}` : "/gallery"}
              aria-current={current ? "page" : undefined}
              scroll={false}
              className={cn(
                "focus-visible:outline-ring inline-flex min-h-10 items-center rounded-md border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                current ? "border-ink bg-ink text-paper" : "hover:border-ink",
              )}
            >
              {d.name}
            </Link>
          );
        })}
      </nav>
      {items.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
          No work to show here yet.
        </p>
      ) : (
        <GalleryGrid items={items} headingLevel={2} />
      )}
    </div>
  );
}
