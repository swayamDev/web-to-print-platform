import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Designer } from "@/components/designer/designer";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { getOwnAssets } from "@/server/assets";
import { requireUser } from "@/server/auth";
import { getOwnDesign } from "@/server/designs";

export const metadata: Metadata = { title: "Edit design", robots: { index: false } };

type Props = { params: Promise<{ id: string }> };

export default function EditDesignPage({ params }: Props) {
  return (
    <main className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-6">
      <Suspense fallback={<PageSkeleton />}>
        <EditDesign params={params} />
      </Suspense>
    </main>
  );
}

async function EditDesign({ params }: Props) {
  const { id } = await params;
  const user = await requireUser(`/design/${id}`);
  // Row Level Security returns nothing for other customers' designs, so they get a 404.
  const design = await getOwnDesign(id);
  if (!design) notFound();
  const { context } = design;
  const assets = await getOwnAssets(
    context.document.elements.flatMap((e) => (e.type === "image" && e.assetId ? [e.assetId] : [])),
  );

  return (
    <>
      <nav aria-label="Breadcrumb" className="spec-label text-muted-foreground">
        <Link href="/account/designs" className="hover:text-foreground">
          Saved designs
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{design.name}</span>
      </nav>
      <h1 className="sr-only">Edit {design.name}</h1>
      <Designer
        product={{ slug: context.product.slug, name: context.product.name }}
        rules={context.rules}
        config={context.config}
        templateId={context.templateId}
        initialDocument={context.document}
        design={{ id: design.id, name: design.name, isLocked: design.isLocked }}
        userId={user.id}
        initialAssets={assets}
      />
    </>
  );
}
