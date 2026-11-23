import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";

import type { CurrencyCode } from "@/domain/money";
import {
  calculatePrice,
  priceRequestSchema,
  type OptionRule,
  type Orientation,
  type PriceError,
  type PriceQuote,
  type PricingRules,
} from "@/domain/pricing";
import { createSupabasePublicClient } from "@/server/supabase/public";

/**
 * Server-side pricing: loads the current rules from the database and runs the shared
 * engine. This is the authority for every price the customer is charged.
 *
 * Numeric columns are selected as text (`::text`) so no rate ever passes through a
 * JavaScript float on its way to the decimal engine.
 */

const optionsSchema = z.array(
  z.object({
    key: z.string(),
    label: z.string(),
    values: z.array(
      z.object({
        value: z.string(),
        label: z.string(),
        price_per_unit: z.union([z.number(), z.string()]).default(0),
        default: z.boolean().optional(),
      }),
    ),
  }),
);

export async function loadPricingRules(productSlug: string): Promise<PricingRules | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue");

  const supabase = createSupabasePublicClient();

  const [productResult, globalTiersResult, settingsResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        `id, slug, name, pricing_model, base_unit_price::text, setup_fee_minor,
         variable_data_unit_fee::text, min_width_mm, max_width_mm, min_height_mm, max_height_mm,
         orientations, min_qty, max_qty, qty_step, supports_variable_data, options,
         product_materials(price_per_cm2::text, price_per_unit::text, is_default, sort_order,
           material:materials(slug, name, is_active)),
         discount_tiers(min_qty, percent_off::text)`,
      )
      .eq("slug", productSlug)
      .eq("is_active", true)
      .maybeSingle(),
    supabase.from("discount_tiers").select("min_qty, percent_off::text").is("product_id", null),
    supabase.from("settings").select("currency, tax_rate::text, tax_label").single(),
  ]);

  if (productResult.error)
    throw new Error(`Could not load pricing: ${productResult.error.message}`);
  if (globalTiersResult.error) throw new Error(globalTiersResult.error.message);
  if (settingsResult.error) throw new Error(settingsResult.error.message);

  const p = productResult.data;
  if (!p) return null;

  // Admin-edited JSON: validate rather than trust its shape.
  const options: OptionRule[] = optionsSchema.parse(p.options).map((o) => ({
    key: o.key,
    label: o.label,
    values: o.values.map((v) => ({
      value: v.value,
      label: v.label,
      pricePerUnit: String(v.price_per_unit),
      isDefault: v.default,
    })),
  }));

  const productTiers = p.discount_tiers ?? [];
  const tiers = (productTiers.length > 0 ? productTiers : globalTiersResult.data).map((t) => ({
    minQty: t.min_qty,
    percentOff: t.percent_off,
  }));

  return {
    product: {
      slug: p.slug,
      name: p.name,
      pricingModel: p.pricing_model,
      baseUnitPrice: p.base_unit_price,
      setupFeeMinor: p.setup_fee_minor,
      variableDataUnitFee: p.variable_data_unit_fee,
      minWidthMm: Number(p.min_width_mm),
      maxWidthMm: Number(p.max_width_mm),
      minHeightMm: Number(p.min_height_mm),
      maxHeightMm: Number(p.max_height_mm),
      orientations: p.orientations as Orientation[],
      minQty: p.min_qty,
      maxQty: p.max_qty,
      qtyStep: p.qty_step,
      supportsVariableData: p.supports_variable_data,
    },
    materials: (p.product_materials ?? [])
      .filter((pm) => pm.material?.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((pm) => ({
        slug: pm.material!.slug,
        name: pm.material!.name,
        pricePerCm2: pm.price_per_cm2,
        pricePerUnit: pm.price_per_unit,
        isDefault: pm.is_default,
      })),
    options,
    tiers,
    settings: {
      currency: settingsResult.data.currency as CurrencyCode,
      taxRate: settingsResult.data.tax_rate,
      taxLabel: settingsResult.data.tax_label,
    },
  };
}

export type QuoteOutcome =
  | { status: 200; quote: PriceQuote }
  | { status: 400 | 404 | 422; errors: PriceError[] | { field: string; message: string }[] };

/**
 * Validate untrusted input and price it with the current rules.
 * 400 = malformed request, 404 = unknown product, 422 = valid shape but not orderable.
 */
export async function quotePrice(input: unknown): Promise<QuoteOutcome> {
  const parsed = priceRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "request",
        message: issue.message,
      })),
    };
  }

  const rules = await loadPricingRules(parsed.data.productSlug);
  if (!rules) {
    return { status: 404, errors: [{ field: "productSlug", message: "Unknown product." }] };
  }

  const result = calculatePrice(rules, parsed.data);
  return result.ok ? { status: 200, quote: result.quote } : { status: 422, errors: result.errors };
}
