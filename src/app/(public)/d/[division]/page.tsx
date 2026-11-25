import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DivisionIcon } from "@/components/brand/division-icon";
import { StorefrontImage } from "@/components/brand/storefront-image";
import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { formatMm } from "@/lib/format";
import { getDivisions, getDivisionWithProducts } from "@/server/catalogue";
import { getGallery } from "@/server/gallery";

type Props = { params: Promise<{ division: string }> };

export async function generateStaticParams() {
  const divisions = await getDivisions();
  return divisions.map((d) => ({ division: d.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { division: slug } = await params;
  const division = await getDivisionWithProducts(slug);
  return division
    ? {
        title: division.name,
        description: division.description ?? division.tagline ?? undefined,
        alternates: { canonical: `/d/${encodeURIComponent(slug)}` },
      }
    : { title: "Not found" };
}

export default function DivisionPage({ params }: Props) {
  return (
    <main className="mx-auto grid w-full max-w-[96rem] gap-7 px-4 py-7 md:gap-10 md:px-8 md:py-10 lg:px-12">
      <Suspense fallback={<PageSkeleton />}>
        <DivisionContent params={params} />
      </Suspense>
    </main>
  );
}

async function DivisionContent({ params }: Props) {
  const slug = (await params).division;
  const [division, gallery] = await Promise.all([getDivisionWithProducts(slug), getGallery(slug)]);
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

      <header className="grid items-center gap-5 border-b pb-6 md:grid-cols-2 md:gap-8 md:pb-8">
        <div className="grid content-center justify-items-start gap-3">
          <DivisionIcon slug={division.slug} className="size-10" />
          <h1 className="text-4xl font-bold md:text-5xl">{division.name}</h1>
          {division.description ? (
            <p className="text-muted-foreground max-w-2xl text-lg">{division.description}</p>
          ) : null}
        </div>
        <StorefrontImage slug={division.slug} sizes="(max-width: 767px) 100vw, 50vw" />
      </header>

      {division.products.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center">
          New products for this division are on the way.
        </p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {division.products.map((product) => (
            <li key={product.id}>
              <Link
                href={`/p/${product.slug}`}
                className="group bg-card hover:border-ink focus-visible:outline-ring flex h-full flex-col gap-4 rounded-lg border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 sm:p-5"
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

      {division.slug === "race-event-numbers" ? (
        <section aria-labelledby="race-samples" className="grid gap-4">
          <h2 id="race-samples" className="text-2xl font-semibold">
            Race bib details
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <StorefrontImage slug="race-material" placement="support" />
            <StorefrontImage slug="race-context" placement="support" />
          </div>
        </section>
      ) : null}

      {gallery.length > 0 ? (
        <section aria-labelledby="division-gallery" className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="division-gallery" className="text-2xl font-semibold">
              Sample work
            </h2>
            <Link
              href={`/gallery?division=${division.slug}`}
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              More in the gallery
            </Link>
          </div>
          <GalleryGrid items={gallery} />
        </section>
      ) : null}
    </>
  );
}
