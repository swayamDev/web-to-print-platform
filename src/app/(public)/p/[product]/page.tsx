import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import { formatMm } from "@/lib/format";
import { getDivisions, getDivisionWithProducts, getProductDetail } from "@/server/catalogue";

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
  const product = await getProductDetail((await params).product);
  if (!product) notFound();

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

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="specs-heading" className="grid content-start gap-6">
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

          {product.sizePresets.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="text-base font-semibold">Popular sizes</h3>
              <ul className="flex flex-wrap gap-2">
                {product.sizePresets.map((preset) => (
                  <li
                    key={preset.label}
                    className="num bg-card rounded-md border px-3 py-1.5 font-mono text-sm"
                  >
                    {preset.label}
                  </li>
                ))}
              </ul>
              {product.allowCustomSize ? (
                <p className="text-muted-foreground text-sm">
                  Or any custom size within the ranges above.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2">
            <h3 className="text-base font-semibold">Materials</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {product.materials.map((material) => (
                <li key={material.slug} className="bg-card rounded-lg border p-3">
                  <p className="font-medium">
                    {material.name}
                    {material.isDefault ? (
                      <span className="spec-label text-muted-foreground ml-2">Default</span>
                    ) : null}
                  </p>
                  {material.description ? (
                    <p className="text-muted-foreground text-sm">{material.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          {product.options.map((option) => (
            <div key={option.key} className="grid gap-2">
              <h3 className="text-base font-semibold">{option.label}</h3>
              <ul className="flex flex-wrap gap-2">
                {option.values.map((value) => (
                  <li key={value.value} className="bg-card rounded-md border px-3 py-1.5 text-sm">
                    {value.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <aside className="grid content-start gap-4">
          <div className="bg-ink text-paper grid gap-3 rounded-xl p-6">
            <p className="spec-label text-paper/60">Price and order</p>
            <p className="text-paper/85 text-sm">
              Online configuration with an instant price is being added to this page. It will price
              your exact size, material and quantity, including volume discounts.
            </p>
          </div>

          {product.templates.length > 0 ? (
            <div className="bg-card grid gap-3 rounded-xl border p-6">
              <h2 className="text-base font-semibold">Start from a template</h2>
              <ul className="grid gap-3">
                {product.templates.map((template) => (
                  <li key={template.id}>
                    <p className="font-medium">{template.name}</p>
                    {template.description ? (
                      <p className="text-muted-foreground text-sm">{template.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}
