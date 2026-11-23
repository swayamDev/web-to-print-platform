import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { createSupabasePublicClient } from "@/server/supabase/public";

/**
 * Public catalogue reads. Cached across requests (Cache Components) and tagged
 * "catalogue" so admin edits can refresh them with revalidateTag("catalogue").
 */

export type DivisionSummary = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  sortOrder: number;
  productCount: number;
  /** Default size of the division's first product, for the spec label on hub tiles. */
  sampleSize: { widthMm: number; heightMm: number } | null;
};

export async function getDivisions(): Promise<DivisionSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue");

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("divisions")
    .select(
      "id, slug, name, tagline, description, sort_order, products(default_width_mm, default_height_mm, sort_order, is_active)",
    )
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(`Could not load divisions: ${error.message}`);

  return data.map((d) => {
    const products = (d.products ?? [])
      .filter((p) => p.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
    const first = products[0];
    return {
      id: d.id,
      slug: d.slug,
      name: d.name,
      tagline: d.tagline,
      description: d.description,
      sortOrder: d.sort_order,
      productCount: products.length,
      sampleSize: first
        ? { widthMm: Number(first.default_width_mm), heightMm: Number(first.default_height_mm) }
        : null,
    };
  });
}

export type ProductSummary = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  minWidthMm: number;
  maxWidthMm: number;
  minHeightMm: number;
  maxHeightMm: number;
  defaultWidthMm: number;
  defaultHeightMm: number;
  minQty: number;
  supportsVariableData: boolean;
};

export async function getDivisionWithProducts(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue");

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("divisions")
    .select(
      "id, slug, name, tagline, description, products(id, slug, name, short_description, min_width_mm, max_width_mm, min_height_mm, max_height_mm, default_width_mm, default_height_mm, min_qty, supports_variable_data, sort_order, is_active)",
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`Could not load division: ${error.message}`);
  if (!data) return null;

  const products: ProductSummary[] = (data.products ?? [])
    .filter((p) => p.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      shortDescription: p.short_description,
      minWidthMm: Number(p.min_width_mm),
      maxWidthMm: Number(p.max_width_mm),
      minHeightMm: Number(p.min_height_mm),
      maxHeightMm: Number(p.max_height_mm),
      defaultWidthMm: Number(p.default_width_mm),
      defaultHeightMm: Number(p.default_height_mm),
      minQty: p.min_qty,
      supportsVariableData: p.supports_variable_data,
    }));

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    tagline: data.tagline,
    description: data.description,
    products,
  };
}

export async function getProductDetail(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue");

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `*,
       division:divisions(slug, name),
       product_materials(price_per_cm2, price_per_unit, is_default, sort_order, material:materials(slug, name, description, is_active)),
       templates(id, name, group_name, description, is_active, sort_order)`,
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`Could not load product: ${error.message}`);
  if (!data || !data.division) return null;

  const materials = (data.product_materials ?? [])
    .filter((pm) => pm.material?.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((pm) => ({
      slug: pm.material!.slug,
      name: pm.material!.name,
      description: pm.material!.description,
      isDefault: pm.is_default,
    }));

  const templates = (data.templates ?? [])
    .filter((t) => t.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({ id: t.id, name: t.name, group: t.group_name, description: t.description }));

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    shortDescription: data.short_description,
    description: data.description,
    division: data.division,
    pricingModel: data.pricing_model,
    minWidthMm: Number(data.min_width_mm),
    maxWidthMm: Number(data.max_width_mm),
    minHeightMm: Number(data.min_height_mm),
    maxHeightMm: Number(data.max_height_mm),
    defaultWidthMm: Number(data.default_width_mm),
    defaultHeightMm: Number(data.default_height_mm),
    allowCustomSize: data.allow_custom_size,
    sizePresets: data.size_presets as { label: string; width_mm: number; height_mm: number }[],
    orientations: data.orientations,
    bleedMm: Number(data.bleed_mm),
    safeMarginMm: Number(data.safe_margin_mm),
    outputDpi: data.output_dpi,
    mirrorOutput: data.mirror_output,
    minQty: data.min_qty,
    maxQty: data.max_qty,
    supportsVariableData: data.supports_variable_data,
    options: data.options as {
      key: string;
      label: string;
      values: { value: string; label: string; default?: boolean }[];
    }[],
    materials,
    templates,
  };
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;
