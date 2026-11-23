import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Designer } from "@/components/designer/designer";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { getNewDesignContext, type DesignConfig } from "@/server/designs";

export const metadata: Metadata = { title: "Design online", robots: { index: false } };

type SearchParams = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<SearchParams> };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const num = (v: string | string[] | undefined) => {
  const n = Number(one(v));
  return one(v) !== undefined && Number.isFinite(n) ? n : undefined;
};

/** Configuration carried over from the product configurator's URL. */
function configFromParams(params: SearchParams): Partial<DesignConfig> {
  const options: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("opt.") && typeof value === "string") options[key.slice(4)] = value;
  }
  const quantity = num(params.q);
  return {
    widthMm: num(params.w),
    heightMm: num(params.h),
    materialSlug: one(params.m),
    quantity: quantity !== undefined && Number.isInteger(quantity) ? quantity : undefined,
    options,
    variableData: one(params.vd) === "1",
  };
}

export default function NewDesignPage({ searchParams }: Props) {
  return (
    <main className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-6">
      <Suspense fallback={<PageSkeleton />}>
        <NewDesign searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function NewDesign({ searchParams }: Props) {
  const params = await searchParams;
  const productSlug = one(params.product);
  if (!productSlug) notFound();

  const context = await getNewDesignContext({
    productSlug,
    templateId: one(params.template) ?? null,
    config: configFromParams(params),
  });
  if (!context) notFound();

  if (context.configErrors.length > 0) {
    return (
      <div className="mx-auto grid max-w-lg gap-4 py-12">
        <h1 className="text-2xl font-semibold">Check your configuration</h1>
        <ul className="text-destructive list-disc pl-5 text-sm">
          {context.configErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
        <Link
          href={`/p/${context.product.slug}`}
          className={buttonVariants({ className: "w-fit" })}
        >
          Back to {context.product.name}
        </Link>
      </div>
    );
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="spec-label text-muted-foreground">
        <Link href={`/p/${context.product.slug}`} className="hover:text-foreground">
          {context.product.name}
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Design</span>
      </nav>
      <h1 className="sr-only">Design your {context.product.name}</h1>
      <Designer
        product={{ slug: context.product.slug, name: context.product.name }}
        rules={context.rules}
        config={context.config}
        templateId={context.templateId}
        initialDocument={context.document}
        design={null}
      />
    </>
  );
}
