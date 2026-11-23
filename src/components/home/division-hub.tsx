import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { DivisionIcon } from "@/components/brand/division-icon";
import type { DivisionSummary } from "@/server/catalogue";

const mm = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * The product hub: equal-weight tiles that act as the main navigation (PRD p8 §12).
 * Tiles come from the database, so a new division appears without code changes (p9 §14).
 */
export function DivisionHub({ divisions }: { divisions: DivisionSummary[] }) {
  return (
    <ul className="bg-border grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-3">
      {divisions.map((division, index) => (
        <li key={division.id} className="bg-card">
          <Link
            href={`/d/${division.slug}`}
            className="group hover:bg-paper focus-visible:bg-paper relative flex h-full min-h-56 flex-col gap-4 p-6 transition-colors duration-200 focus-visible:outline-none"
          >
            {/* Accent rule that draws in on hover */}
            <span
              aria-hidden="true"
              className="bg-signal absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 group-focus-visible:scale-x-100"
            />
            <div className="flex items-start justify-between">
              <span className="spec-label text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="text-muted-foreground group-hover:text-ink size-5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </div>

            <DivisionIcon slug={division.slug} className="size-9" />

            <div className="mt-auto grid gap-1">
              <h3 className="text-xl font-semibold">{division.name}</h3>
              {division.tagline ? (
                <p className="text-muted-foreground text-sm">{division.tagline}</p>
              ) : null}
            </div>

            <p className="spec-label text-muted-foreground border-t pt-3">
              {division.sampleSize
                ? `e.g. ${mm(division.sampleSize.widthMm)} × ${mm(division.sampleSize.heightMm)} mm`
                : "Made to measure"}
              {" · "}
              {division.productCount} product{division.productCount === 1 ? "" : "s"}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
