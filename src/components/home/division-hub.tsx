import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { DivisionIcon } from "@/components/brand/division-icon";
import { StorefrontImage } from "@/components/brand/storefront-image";
import { formatMm } from "@/lib/format";
import type { DivisionSummary } from "@/server/catalogue";

/** Render catalogue divisions from the database, including those without commissioned imagery. */
export function DivisionHub({ divisions }: { divisions: DivisionSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-3 md:gap-6">
      {divisions.map((division) => (
        <li key={division.id} className="min-w-0">
          <Link
            href={`/d/${division.slug}`}
            className="group hover:border-ink focus-visible:outline-ring flex h-full flex-col border-b focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <div className="bg-card relative grid aspect-[4/3] place-items-center overflow-hidden">
              <DivisionIcon slug={division.slug} className="size-12" />
              <StorefrontImage slug={division.slug} className="absolute inset-0" />
            </div>
            <div className="flex flex-1 items-start gap-2 py-3">
              <DivisionIcon
                slug={division.slug}
                className="mt-0.5 hidden size-6 shrink-0 lg:block"
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-base leading-tight font-bold sm:text-xl">{division.name}</h3>
                {division.tagline ? (
                  <p className="text-muted-foreground mt-1 text-sm leading-snug">
                    {division.tagline}
                  </p>
                ) : null}
                {division.sampleSize ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatMm(division.sampleSize.widthMm)} ×{" "}
                    {formatMm(division.sampleSize.heightMm)} mm
                  </p>
                ) : null}
              </div>
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
