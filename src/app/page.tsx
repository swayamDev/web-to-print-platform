import { ArrowRight, CheckCheck, FilePenLine, Printer, Ruler, WalletCards } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { RegistrationMark } from "@/components/brand/logo";
import { StorefrontImage } from "@/components/brand/storefront-image";
import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { DivisionHub } from "@/components/home/division-hub";
import { QuickPrice, type QuickPriceProduct } from "@/components/home/quick-price";
import { SampleProof } from "@/components/home/sample-proof";
import { buttonVariants } from "@/components/ui/button";
import { getDivisions, getQuickPriceCatalogue } from "@/server/catalogue";
import { getGallery } from "@/server/gallery";
import { loadPricingRules } from "@/server/pricing";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    images: [
      {
        url: "/storefront/photos/share.jpg",
        width: 1200,
        height: 630,
        alt: "AI-generated DHprint sample products on a graphite worktop",
      },
    ],
  },
};

const STEPS = [
  {
    title: "Configure",
    body: "Choose the size, material and quantity. See the price including VAT.",
    Icon: Ruler,
  },
  { title: "Add artwork", body: "Design online or upload finished artwork.", Icon: FilePenLine },
  { title: "Pay", body: "Review the order and complete checkout.", Icon: WalletCards },
  {
    title: "Approve proof",
    body: "Check the latest version or request changes.",
    Icon: CheckCheck,
  },
  { title: "Production", body: "Staff generate files from the approved proof.", Icon: Printer },
];

/** Load catalogue presets and the same pricing rules used by the product configurator. */
async function loadQuickPriceProducts(): Promise<QuickPriceProduct[]> {
  const catalogue = await getQuickPriceCatalogue();
  const entries = await Promise.all(
    catalogue.map(async ({ slug, ...presets }) => {
      const rules = await loadPricingRules(slug);
      return rules ? { ...presets, rules } : null;
    }),
  );
  return entries.filter((e): e is QuickPriceProduct => e !== null);
}

const shell = "mx-auto w-full max-w-[96rem] px-4 md:px-8 lg:px-12";

export default async function HomePage() {
  const [divisions, quickPriceProducts, gallery] = await Promise.all([
    getDivisions(),
    loadQuickPriceProducts(),
    getGallery(),
  ]);
  const showcase = gallery
    .filter((item, i) => gallery.findIndex((g) => g.division.slug === item.division.slug) === i)
    .slice(0, 6);

  return (
    <main>
      <section className="bg-ink grid text-white md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid content-center justify-items-start gap-4 px-4 pt-7 pb-5 md:py-12 md:pl-8 lg:gap-6 lg:pl-[max(3rem,calc((100vw-90rem)/2))]">
          <h1 className="font-display text-[clamp(2rem,7.7vw,4rem)] leading-[0.98] tracking-[-0.045em] md:text-[clamp(2.15rem,5.2vw,6.2rem)]">
            Make it.
            <br />
            Check it.
            <br />
            Print it.
          </h1>
          <p className="text-paper max-w-[39ch] lg:text-xl">
            Configure custom print, see the price including VAT and approve a proof before
            production.
          </p>
          <Link href="#quote" className={buttonVariants({ size: "lg", className: "h-11 px-4" })}>
            Get a price <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div className="relative min-w-0 md:self-center">
          <StorefrontImage slug="hero" placement="hero" sizes="(max-width: 767px) 100vw, 55vw" />
          <RegistrationMark className="motion-reveal text-signal pointer-events-none absolute top-[7%] right-[7%] size-10 lg:size-12 xl:size-16" />
        </div>
      </section>

      <section id="quote" aria-labelledby="price-heading" className="bg-signal scroll-mt-16">
        <div
          className={`${shell} grid items-center gap-4 py-7 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-8 lg:py-10`}
        >
          <div className="grid gap-2">
            <h2 id="price-heading" className="text-3xl font-bold md:text-5xl">
              Price your print.
            </h2>
            <p className="text-ink/85">Includes VAT and quantity discounts.</p>
          </div>
          {quickPriceProducts.length ? (
            <QuickPrice products={quickPriceProducts} />
          ) : (
            <p className="bg-card border p-4">No products are available to price right now.</p>
          )}
        </div>
      </section>

      <section id="products" aria-labelledby="products-heading" className="scroll-mt-16">
        <div className={`${shell} grid gap-5 py-9 md:gap-8 md:py-16`}>
          <h2 id="products-heading" className="text-3xl font-bold md:text-5xl">
            Find your product.
          </h2>
          {divisions.length ? (
            <DivisionHub divisions={divisions} />
          ) : (
            <p className="text-muted-foreground border border-dashed p-6">
              No divisions are available right now.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="how-heading" className="border-t">
        <div className={`${shell} grid gap-6 py-9 md:py-16`}>
          <h2 id="how-heading" className="text-3xl font-bold md:text-5xl">
            From spec to press.
          </h2>
          <ol className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {STEPS.map(({ title, body, Icon }) => (
              <li
                key={title}
                className="border-signal border-t-2 pt-3 last:col-span-2 md:last:col-span-1"
              >
                <Icon className="mb-2 size-5" aria-hidden="true" />
                <h3 className="font-bold">{title}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="proof-heading" className="bg-muted border-t">
        <div className={`${shell} grid items-center gap-7 py-9 md:grid-cols-2 md:py-16`}>
          <div className="bg-ink grid place-items-center p-5 sm:p-8">
            <SampleProof />
          </div>
          <div className="grid justify-items-start gap-4">
            <h2 id="proof-heading" className="text-3xl font-bold md:text-5xl">
              Check the proof.
              <br />
              Then we print.
            </h2>
            <p className="text-muted-foreground max-w-xl">
              Trim is the finished edge. Bleed extends beyond it to avoid white edges, and the safe
              area keeps key artwork inside the cut. Approve your proof when it is ready, or request
              another version.
            </p>
            <Link
              href="/gallery"
              className={buttonVariants({ variant: "outline", size: "lg", className: "h-11" })}
            >
              Browse sample designs <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {showcase.length > 0 ? (
        <section aria-labelledby="gallery-heading" className={`${shell} grid gap-6 py-9 md:py-14`}>
          <h2 id="gallery-heading" className="text-3xl font-bold">
            Made on this platform
          </h2>
          <GalleryGrid items={showcase} />
        </section>
      ) : null}
    </main>
  );
}
