import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DivisionIcon } from "@/components/brand/division-icon";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { formatMm } from "@/lib/format";
import { getDivisions, getDivisionWithProducts } from "@/server/catalogue";

type Props = { params: Promise<{ division: string }> };

export async function generateStaticParams() {
  const divisions = await getDivisions();
  return divisions.map((d) => ({ division: d.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const division = await getDivisionWithProducts((await params).division);
  return division
    ? { title: division.name, description: division.description ?? division.tagline ?? undefined }
    : { title: "Not found" };
}

export default function DivisionPage({ params }: Props) {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10">
      <Suspense fallback={<PageSkeleton />}>
        <DivisionContent params={params} />
      </Suspense>
    </main>
  );
}

async function DivisionContent({ params }: Props) {
  const division = await getDivisionWithProducts((await params).division);
  if (!division) notFound();

  return (
    <>
      <nav aria-label="Breadcrumb" className="spec-label text-muted-foreground">
        <Link href="/#products" className="hover:text-foreground">
          Products
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{division.name}</span>
      </nav>

      <header className="grid gap-4 md:grid-cols-[auto_1fr] md:items-end md:gap-8">
        <div className="bg-card crop-marks grid size-24 place-items-center rounded-lg border">
          <DivisionIcon slug={division.slug} className="size-11" />
        </div>
        <div className="grid gap-2">
          <h1 className="text-4xl font-semibold">{division.name}</h1>
          {division.description ? (
            <p className="text-muted-foreground max-w-2xl text-lg">{division.description}</p>
          ) : null}
        </div>
      </header>

      {division.products.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center">
          New products for this division are on the way.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {division.products.map((product) => (
            <li key={product.id}>
              <Link
                href={`/p/${product.slug}`}
                className="group bg-card hover:border-ink flex h-full flex-col gap-4 rounded-xl border p-5 transition-colors"
              >
                <div className="grid gap-1">
                  <h2 className="text-xl font-semibold">{product.name}</h2>
                  {product.shortDescription ? (
                    <p className="text-muted-foreground text-sm">{product.shortDescription}</p>
                  ) : null}
                </div>
                <dl className="mt-auto grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                  <div>
                    <dt className="spec-label text-muted-foreground">Width</dt>
                    <dd className="num font-mono">
                      {formatMm(product.minWidthMm)}–{formatMm(product.maxWidthMm)} mm
                    </dd>
                  </div>
                  <div>
                    <dt className="spec-label text-muted-foreground">Height</dt>
                    <dd className="num font-mono">
                      {formatMm(product.minHeightMm)}–{formatMm(product.maxHeightMm)} mm
                    </dd>
                  </div>
                  <div>
                    <dt className="spec-label text-muted-foreground">Minimum</dt>
                    <dd className="num font-mono">{product.minQty} pcs</dd>
                  </div>
                  <div>
                    <dt className="spec-label text-muted-foreground">Personalise</dt>
                    <dd>{product.supportsVariableData ? "CSV merge" : "One design"}</dd>
                  </div>
                </dl>
                <span className="flex items-center gap-1 text-sm font-medium">
                  View product
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
