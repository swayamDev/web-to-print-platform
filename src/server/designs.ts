import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";

import { blankDocument, fitDocumentToSize } from "@/domain/design/document";
import { designDocumentSchema, type DesignDocument } from "@/domain/design/schema";
import { calculatePrice, priceRequestSchema, type PricingRules } from "@/domain/pricing";
import { getProductDetail, type ProductDetail } from "@/server/catalogue";
import { loadPricingRules } from "@/server/pricing";
import { createSupabasePublicClient } from "@/server/supabase/public";
import { createSupabaseServerClient } from "@/server/supabase/server";

/** Product configuration saved with a design (same shape the price API accepts). */
export const designConfigSchema = priceRequestSchema.omit({ productSlug: true });
export type DesignConfig = z.infer<typeof designConfigSchema>;

export async function getTemplateDocument(templateId: string): Promise<DesignDocument | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue");
  if (!z.string().uuid().safeParse(templateId).success) return null;
  const { data } = await createSupabasePublicClient()
    .from("templates")
    .select("document")
    .eq("id", templateId)
    .eq("is_active", true)
    .maybeSingle();
  const parsed = designDocumentSchema.safeParse(data?.document);
  return parsed.success ? parsed.data : null;
}

export type DesignerContext = {
  product: ProductDetail;
  rules: PricingRules;
  config: DesignConfig;
  /** Config problems (e.g. a size outside the product's range) to show instead of the canvas. */
  configErrors: string[];
  templateId: string | null;
  document: DesignDocument;
};

/**
 * Everything the designer needs to start a new design: the product, its pricing rules, the
 * configuration (from the configurator's URL) and a starting document, either the chosen
 * template fitted to the configured size or a blank page.
 */
export async function getNewDesignContext(input: {
  productSlug: string;
  templateId?: string | null;
  config: Partial<DesignConfig>;
}): Promise<DesignerContext | null> {
  const [product, rules] = await Promise.all([
    getProductDetail(input.productSlug),
    loadPricingRules(input.productSlug),
  ]);
  if (!product || !rules) return null;

  const defaultMaterial =
    rules.materials.find((m) => m.isDefault)?.slug ?? rules.materials[0]?.slug ?? "";
  const config: DesignConfig = {
    widthMm: input.config.widthMm ?? product.defaultWidthMm,
    heightMm: input.config.heightMm ?? product.defaultHeightMm,
    materialSlug: input.config.materialSlug ?? defaultMaterial,
    quantity: input.config.quantity ?? Math.max(product.minQty, Math.min(100, product.maxQty)),
    options: input.config.options ?? {},
    variableData: input.config.variableData ?? false,
  };
  const priced = calculatePrice(rules, { productSlug: product.slug, ...config });
  const configErrors = priced.ok ? [] : priced.errors.map((e) => e.message);

  const spec = {
    trimW: config.widthMm,
    trimH: config.heightMm,
    bleed: product.bleedMm,
    safeMargin: product.safeMarginMm,
  };
  const templateId =
    input.templateId && product.templates.some((t) => t.id === input.templateId)
      ? input.templateId
      : null;
  const template = templateId ? await getTemplateDocument(templateId) : null;
  const document = template ? fitDocumentToSize(template, spec) : blankDocument(spec);

  return { product, rules, config, configErrors, templateId, document };
}

export type SavedDesign = {
  id: string;
  name: string;
  isLocked: boolean;
  updatedAt: string;
  context: DesignerContext;
};

/** A saved design, readable only by its owner (RLS), with its designer context. */
export async function getOwnDesign(designId: string): Promise<SavedDesign | null> {
  if (!z.string().uuid().safeParse(designId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("designs")
    .select(
      "id, name, config, document, template_id, is_locked, updated_at, product:products(slug)",
    )
    .eq("id", designId)
    .maybeSingle();
  if (!data?.product) return null;

  const config = designConfigSchema.safeParse(data.config);
  const document = designDocumentSchema.safeParse(data.document);
  const [product, rules] = await Promise.all([
    getProductDetail(data.product.slug),
    loadPricingRules(data.product.slug),
  ]);
  if (!product || !rules || !config.success || !document.success) return null;

  const priced = calculatePrice(rules, { productSlug: product.slug, ...config.data });
  return {
    id: data.id,
    name: data.name,
    isLocked: data.is_locked,
    updatedAt: data.updated_at,
    context: {
      product,
      rules,
      config: config.data,
      configErrors: priced.ok ? [] : priced.errors.map((e) => e.message),
      templateId: data.template_id,
      document: document.data,
    },
  };
}

export type DesignSummary = {
  id: string;
  name: string;
  productName: string;
  productSlug: string;
  widthMm: number;
  heightMm: number;
  updatedAt: string;
  isLocked: boolean;
};

/** The signed-in customer's saved designs, newest first (RLS limits rows to the owner). */
export async function listOwnDesigns(): Promise<DesignSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("designs")
    .select("id, name, config, updated_at, is_locked, product:products(name, slug)")
    .order("updated_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((d) => {
    const config = designConfigSchema.safeParse(d.config);
    return {
      id: d.id,
      name: d.name,
      productName: d.product?.name ?? "Unknown product",
      productSlug: d.product?.slug ?? "",
      widthMm: config.success ? config.data.widthMm : 0,
      heightMm: config.success ? config.data.heightMm : 0,
      updatedAt: d.updated_at,
      isLocked: d.is_locked,
    };
  });
}
