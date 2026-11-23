import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { DivisionHub } from "@/components/home/division-hub";
import { SampleProof } from "@/components/home/sample-proof";
import { buttonVariants } from "@/components/ui/button";
import { getDivisions } from "@/server/catalogue";

const STEPS = [
  {
    title: "Configure",
    body: "Any size within the product's limits, your material, orientation and quantity. Volume discounts apply automatically.",
  },
  {
    title: "Design",
    body: "Edit a template or upload finished artwork. Guides show trim, bleed and the safe area, so nothing unprintable gets through.",
  },
  {
    title: "Approve the proof",
    body: "Every revision is saved as a new version. Request changes, or approve the exact version that will be printed.",
  },
  {
    title: "We print",
    body: "Approval unlocks print-ready files for production. Track the job, download your invoice, reorder in one click.",
  },
];

/** Home: hero, the six-division hub, and how ordering works. Fully prerendered. */
export default async function HomePage() {
  const divisions = await getDivisions();

  return (
    <main>
      <section className="bg-mm-grid border-b">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-14 md:grid-cols-[1.25fr_1fr] md:py-20">
          <div className="grid gap-6">
            <p className="spec-label text-muted-foreground">
              Web-to-print · {divisions.length} divisions · one platform
            </p>
            <h1 className="text-[2.6rem] leading-[1.02] font-semibold sm:text-6xl">
              Custom print,
              <br />
              <span className="decoration-signal underline decoration-[0.09em] underline-offset-[0.14em] [text-decoration-skip-ink:none]">
                made to measure.
              </span>
            </h1>
            <p className="text-muted-foreground max-w-xl text-lg">
              Labels, race numbers, MTB boards, stamps, trophies and laser-cut work. Set your size,
              see the price instantly, design inside the print area and approve a proof before
              anything is made.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="#products"
                className={buttonVariants({ size: "lg", className: "h-11 px-5" })}
              >
                Browse products
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link
                href="/signup"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "h-11 px-5",
                })}
              >
                Create an account
              </Link>
            </div>
          </div>
          <SampleProof />
        </div>
      </section>

      <section id="products" aria-labelledby="products-heading" className="scroll-mt-20">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-2">
              <p className="spec-label text-muted-foreground">The range</p>
              <h2 id="products-heading" className="text-3xl font-semibold">
                Choose a division
              </h2>
            </div>
            <p className="text-muted-foreground max-w-sm text-sm">
              Every product is configured, not picked from a list of sizes — one product covers
              every dimension it can be made in.
            </p>
          </div>
          <DivisionHub divisions={divisions} />
        </div>
      </section>

      <section aria-labelledby="how-heading" className="bg-card border-y">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14">
          <div className="grid gap-2">
            <p className="spec-label text-muted-foreground">How it works</p>
            <h2 id="how-heading" className="text-3xl font-semibold">
              From quote to finished job
            </h2>
          </div>
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-ink grid content-start gap-2 border-t-2 pt-4">
                <span className="spec-label text-signal">
                  Step {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-muted-foreground text-sm">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
