import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Configurator } from "@/components/configurator/configurator";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { formatMm } from "@/lib/format";
import { getDivisions, getDivisionWithProducts, getProductDetail } from "@/server/catalogue";
import { loadPricingRules } from "@/server/pricing";

type Props = { params: Promise<{ product: string }> };

export async function generateStaticParams() {
  const divisions = await getDivisions();
  const all = await Promise.all(divisions.map((d) => getDivisionWithProducts(d.slug)));
  return all.flatMap((d) => d?.products.map((p) => ({ product: p.slug })) ?? []);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductDetail((await params).product);
  return product
    ? { title: product.name, description: product.shortDescription ?? undefined }
    : { title: "Not found" };
}

export default function ProductPage({ params }: Props) {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10">
      <Suspense fallback={<PageSkeleton />}>
        <ProductContent params={params} />
      </Suspense>
    </main>
  );
}

async function ProductContent({ params }: Props) {
  const slug = (await params).product;
  const [product, rules] = await Promise.all([getProductDetail(slug), loadPricingRules(slug)]);
  if (!product || !rules) notFound();

  const specs: { label: string; value: string }[] = [
    {
      label: "Width",
      value: `${formatMm(product.minWidthMm)}–${formatMm(product.maxWidthMm)} mm`,
    },
    {
      label: "Height",
      value: `${formatMm(product.minHeightMm)}–${formatMm(product.maxHeightMm)} mm`,
    },
    {
      label: "Standard size",
      value: `${formatMm(product.defaultWidthMm)} × ${formatMm(product.defaultHeightMm)} mm`,
    },
    {
      label: "Orientation",
      value: product.orientations.map((o) => o.charAt(0).toUpperCase() + o.slice(1)).join(" or "),
    },
    { label: "Quantity", value: `${product.minQty}–${product.maxQty.toLocaleString("en-GB")}` },
    { label: "Bleed", value: `${formatMm(product.bleedMm)} mm` },
    { label: "Safe margin", value: `${formatMm(product.safeMarginMm)} mm` },
    { label: "Print resolution", value: `${product.outputDpi} DPI` },
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="spec-label text-muted-foreground">
        <Link href="/#products" className="hover:text-foreground">
          Products
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/d/${product.division.slug}`} className="hover:text-foreground">
          {product.division.name}
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <header className="grid gap-3">
        <h1 className="text-4xl font-semibold">{product.name}</h1>
        {product.shortDescription ? (
          <p className="text-muted-foreground max-w-2xl text-lg">{product.shortDescription}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {product.supportsVariableData ? (
            <span className="spec-label bg-signal/15 rounded-full px-3 py-1">
              Personalise each item from a CSV
            </span>
          ) : null}
          {product.mirrorOutput ? (
            <span className="spec-label bg-muted rounded-full px-3 py-1">
              Produced mirrored for stamping
            </span>
          ) : null}
        </div>
      </header>

      <section aria-label="Configure and price">
        <Configurator
          rules={rules}
          presets={product.sizePresets}
          allowCustomSize={product.allowCustomSize}
          defaultWidthMm={product.defaultWidthMm}
          defaultHeightMm={product.defaultHeightMm}
          designTemplateId={product.templates[0]?.id}
          materialDescriptions={Object.fromEntries(
            product.materials.map((m) => [m.slug, m.description]),
          )}
        />
      </section>

      <div className="grid gap-8 border-t pt-10 lg:grid-cols-[1.35fr_1fr]">
        <section aria-labelledby="specs-heading" className="grid content-start gap-4">
          <h2 id="specs-heading" className="text-xl font-semibold">
            Specification
          </h2>
          <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-4">
            {specs.map((spec) => (
              <div key={spec.label} className="bg-card grid gap-1 p-4">
                <dt className="spec-label text-muted-foreground">{spec.label}</dt>
                <dd className="num font-mono text-sm">{spec.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground text-sm">
            Prices are sample rates for this demonstration and include {rules.settings.taxLabel}.
          </p>
        </section>

        {product.templates.length > 0 ? (
          <aside className="bg-card grid content-start gap-3 rounded-xl border p-6">
            <h2 className="text-base font-semibold">Templates for this product</h2>
            <p className="text-muted-foreground text-sm">
              Rendered on our print server at true size, with trim (black), bleed (orange tint) and
              the safe area (dashed) marked.
            </p>
            <ul className="grid gap-4">
              {product.templates.map((template) => (
                <li key={template.id} className="grid gap-2">
                  {/* Server-rendered PNG of the template; same engine as proofs and print files. */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- dynamic server render, not a static asset */}
                  <img
                    src={`/api/v1/templates/${template.id}/preview?format=png&dpi=96`}
                    alt={`${template.name} template preview`}
                    loading="lazy"
                    className="bg-muted max-h-72 w-auto max-w-full self-start rounded-md border object-contain"
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium">{template.name}</p>
                      {template.description ? (
                        <p className="text-muted-foreground text-sm">{template.description}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-3 text-sm">
                      <Link
                        href={`/design/new?product=${product.slug}&template=${template.id}`}
                        className="font-medium underline underline-offset-4"
                      >
                        Use this template
                      </Link>
                      <a
                        href={`/api/v1/templates/${template.id}/preview?format=pdf`}
                        className="underline underline-offset-4"
                      >
                        Print-ready PDF
                      </a>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
      {/* Room for the fixed price bar on phones. */}
      <div className="h-16 lg:hidden" aria-hidden="true" />
    </>
  );
}
