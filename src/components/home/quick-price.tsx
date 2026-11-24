"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatMinor } from "@/domain/money";
import { calculatePrice, type PricingRules } from "@/domain/pricing";
import { formatMajor, formatMm, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type QuickPriceProduct = {
  rules: PricingRules;
  divisionName: string;
  presets: { label: string; width_mm: number; height_mm: number }[];
  defaultWidthMm: number;
  defaultHeightMm: number;
};

/**
 * Instant price calculator on the home page (PRD p8 §12): pick a product, a popular size and
 * a quantity, and see the VAT-inclusive price immediately. "Configure in full" carries the
 * choices to the product page.
 */
export function QuickPrice({ products }: { products: QuickPriceProduct[] }) {
  const [slug, setSlug] = useState(products[0]?.rules.product.slug ?? "");
  const product = products.find((p) => p.rules.product.slug === slug) ?? products[0];
  const sizes = product?.presets.length
    ? product.presets
    : product
      ? [
          {
            label: "Standard",
            width_mm: product.defaultWidthMm,
            height_mm: product.defaultHeightMm,
          },
        ]
      : [];
  const [sizeIndex, setSizeIndex] = useState(0);
  const [quantityText, setQuantityText] = useState("100");

  if (!product) return null;
  const { rules } = product;
  const size = sizes[Math.min(sizeIndex, sizes.length - 1)]!;
  const quantity = Number(quantityText);
  const material = rules.materials.find((m) => m.isDefault) ?? rules.materials[0];

  const result =
    material && Number.isInteger(quantity) && quantity > 0
      ? calculatePrice(rules, {
          productSlug: rules.product.slug,
          widthMm: size.width_mm,
          heightMm: size.height_mm,
          materialSlug: material.slug,
          quantity,
          options: {},
          variableData: false,
        })
      : null;
  const quote = result?.ok ? result.quote : null;
  const error =
    result && !result.ok ? result.errors[0]?.message : quote ? null : "Enter a quantity.";

  const configureHref = `/p/${rules.product.slug}?${new URLSearchParams({
    w: String(size.width_mm),
    h: String(size.height_mm),
    m: material?.slug ?? "",
    q: quantityText,
  })}`;

  return (
    <div className="bg-card grid min-w-0 gap-3 rounded-lg border p-3 sm:p-5">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(5rem,.38fr)] content-start gap-3">
        <div className="grid gap-1.5">
          <label htmlFor="quick-product" className="text-sm font-medium">
            Product
          </label>
          <select
            id="quick-product"
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setSizeIndex(0);
              const next = products.find((p) => p.rules.product.slug === event.target.value);
              if (next && Number(quantityText) < next.rules.product.minQty) {
                setQuantityText(String(next.rules.product.minQty));
              }
            }}
            className="border-input bg-card focus-visible:ring-ring/50 h-10 w-full min-w-0 rounded-md border px-3 outline-none focus-visible:ring-3"
          >
            {products.map((p) => (
              <option key={p.rules.product.slug} value={p.rules.product.slug}>
                {p.rules.product.name} — {p.divisionName}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2 row-start-2 grid gap-1.5">
          <span className="text-sm font-medium" id="quick-size-label">
            Size
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="quick-size-label">
            {sizes.map((s, index) => (
              <button
                key={s.label}
                type="button"
                aria-pressed={index === sizeIndex}
                onClick={() => setSizeIndex(index)}
                className={cn(
                  "num rounded-md border px-3 py-1.5 font-mono text-sm transition-colors",
                  index === sizeIndex ? "border-ink bg-ink text-paper" : "hover:border-ink",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="quick-quantity" className="text-sm font-medium">
            Quantity
          </label>
          <input
            id="quick-quantity"
            inputMode="numeric"
            value={quantityText}
            onChange={(event) => setQuantityText(event.target.value)}
            className="num border-input bg-card focus-visible:ring-ring/50 h-10 w-full min-w-0 rounded-md border px-3 font-mono outline-none focus-visible:ring-3"
          />
        </div>
      </div>

      {material ? (
        <p className="text-muted-foreground font-mono text-xs">
          {material.name} · {formatMm(size.width_mm)} × {formatMm(size.height_mm)} mm
        </p>
      ) : null}
      <div
        className="grid min-w-0 gap-3 border-t pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        aria-live="polite"
      >
        {quote ? (
          <div className="grid gap-1">
            <p
              key={quote.totalGrossMinor}
              data-testid="quick-price-total"
              className="font-heading num motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 text-3xl font-semibold duration-200"
            >
              {formatMinor(quote.totalGrossMinor, quote.currency)}
            </p>
            <p className="text-muted-foreground text-sm">
              {formatMajor(quote.unitGrossDisplay, quote.currency)} each · incl. {quote.taxLabel}
            </p>
            {quote.tier ? (
              <p className="text-success text-sm font-medium">
                {formatPercent(quote.tier.percentOff)} volume discount applied
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-destructive text-sm" role="status">
            {error}
          </p>
        )}
        <Link
          href={configureHref}
          className="border-ink hover:bg-paper focus-visible:outline-ring inline-flex min-h-11 w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Configure in full
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
