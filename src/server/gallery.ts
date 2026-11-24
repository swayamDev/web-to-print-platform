import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";

import { designDocumentSchema } from "@/domain/design/schema";
import { renderDesign } from "@/server/render";
import { createSupabasePublicClient } from "@/server/supabase/public";

/**
 * Gallery of sample work (PRD R-45, DECISIONS D-19): templates with their own text, rendered by
 * the print engine. Cached with the catalogue, so admin edits refresh it.
 */

export type GalleryItem = {
  id: string;
  title: string;
  caption: string | null;
  isSample: boolean;
  division: { slug: string; name: string };
  product: { slug: string; name: string };
  /** Image size in CSS pixels (page incl. bleed at 96 DPI), to reserve space while loading. */
  width: number;
  height: number;
  imageUrl: string;
};

export const GALLERY_DPI = 96;
const MM_PER_INCH = 25.4;

export async function getGallery(divisionSlug?: string): Promise<GalleryItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue");

  const { data, error } = await createSupabasePublicClient()
    .from("gallery_items")
    .select(
      `id, title, caption, is_sample, image_path, sort_order, document,
       division:divisions!inner(slug, name, sort_order, is_active),
       template:templates(id, document, is_active, product:products(slug, name, is_active))`,
    )
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(`Could not load the gallery: ${error.message}`);

  return data
    .filter((g) => g.division?.is_active && (!divisionSlug || g.division.slug === divisionSlug))
    .flatMap((g) => {
      const template = g.template;
      const product = template?.product;
      // An item may carry its own finished design; otherwise the template is rendered.
      const doc = designDocumentSchema.safeParse(g.document ?? template?.document);
      if (!template?.is_active || !product?.is_active || !doc.success) return [];
      const px = (mm: number) => Math.round((mm / MM_PER_INCH) * GALLERY_DPI);
      return [
        {
          item: {
            id: g.id,
            title: g.title,
            caption: g.caption,
            isSample: g.is_sample,
            division: { slug: g.division.slug, name: g.division.name },
            product: { slug: product.slug, name: product.name },
            width: px(doc.data.trim.w + 2 * doc.data.bleed),
            height: px(doc.data.trim.h + 2 * doc.data.bleed),
            imageUrl: `/api/v1/gallery/${g.id}/image`,
          },
          order: [g.division.sort_order, g.sort_order] as const,
        },
      ];
    })
    .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1])
    .map((x) => x.item);
}

/** The rendered PNG for one gallery item (base64, so it can be cached), or null. */
export async function galleryImage(id: string): Promise<string | null> {
  "use cache";
  cacheLife("days");
  cacheTag("catalogue");

  if (!z.string().uuid().safeParse(id).success) return null;
  const { data: item } = await createSupabasePublicClient()
    .from("gallery_items")
    .select("id, title, sample_values, document, template:templates(document, is_active)")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  const doc = designDocumentSchema.safeParse(item?.document ?? item?.template?.document);
  const values = z.record(z.string(), z.string().max(120)).safeParse(item?.sample_values);
  if (!item || !item.template?.is_active || !doc.success || !values.success) return null;

  const result = await renderDesign(
    {
      document: doc.data,
      values: values.data,
      format: "png",
      dpi: GALLERY_DPI * 2, // sharp on high-density screens
      meta: { title: item.title, keywords: [`gallery:${item.id}`], date: new Date(0) },
    },
    true,
  );
  return result.ok ? Buffer.from(result.bytes).toString("base64") : null;
}
