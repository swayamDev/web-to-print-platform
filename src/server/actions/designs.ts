"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { designDocumentSchema } from "@/domain/design/schema";
import { calculatePrice } from "@/domain/pricing";
import { getSessionUser } from "@/server/auth";
import { designConfigSchema } from "@/server/designs";
import { loadPricingRules } from "@/server/pricing";
import { createSupabaseServerClient } from "@/server/supabase/server";

const saveDesignSchema = z.object({
  designId: z.string().uuid().nullable(),
  productSlug: z.string().min(1).max(80),
  templateId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  config: designConfigSchema,
  document: designDocumentSchema,
});

export type SaveDesignInput = z.input<typeof saveDesignSchema>;

export type SaveDesignResult =
  | { status: "saved"; id: string; savedAt: string }
  | { status: "login-required" }
  | { status: "error"; message: string };

/**
 * Save (create or update) a design for the signed-in customer. Runs as the user, so Row Level
 * Security restricts writes to their own designs, and a trigger refuses changes to designs that
 * are locked by an approved proof. Drafts may still contain print issues; those block proofs
 * and checkout, not saving.
 */
export async function saveDesignAction(input: SaveDesignInput): Promise<SaveDesignResult> {
  const user = await getSessionUser();
  if (!user) return { status: "login-required" };

  const parsed = saveDesignSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: "This design could not be read. Please reload." };
  const { designId, productSlug, templateId, name, config, document } = parsed.data;

  // The artwork must match the configured size, and the configuration must be orderable.
  if (
    Math.abs(document.trim.w - config.widthMm) > 0.01 ||
    Math.abs(document.trim.h - config.heightMm) > 0.01
  ) {
    return { status: "error", message: "The artwork size does not match the configured size." };
  }
  const rules = await loadPricingRules(productSlug);
  if (!rules) return { status: "error", message: "This product is no longer available." };
  const priced = calculatePrice(rules, { productSlug, ...config });
  if (!priced.ok) return { status: "error", message: priced.errors[0]!.message };

  const supabase = await createSupabaseServerClient();

  // Images must be this customer's own valid uploads (RLS limits the lookup to their rows), so
  // a design can never point at someone else's file.
  const assetIds = [
    ...new Set(
      document.elements.flatMap((e) => (e.type === "image" && e.assetId ? [e.assetId] : [])),
    ),
  ];
  if (assetIds.length > 0) {
    const { count } = await supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .in("id", assetIds)
      .eq("status", "valid");
    if (count !== assetIds.length) {
      return {
        status: "error",
        message: "An image in this design is no longer available. Upload it again.",
      };
    }
  }

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("slug", productSlug)
    .single();
  if (!product) return { status: "error", message: "This product is no longer available." };

  const row = {
    name,
    product_id: product.id,
    template_id: templateId,
    config,
    document,
    source: "editor" as const,
  };

  if (designId) {
    const { data, error } = await supabase
      .from("designs")
      .update(row)
      .eq("id", designId)
      .select("id, updated_at")
      .maybeSingle();
    if (error?.message.includes("locked")) {
      return {
        status: "error",
        message: "This design is locked by an approved proof. Save a copy to edit it.",
      };
    }
    if (error || !data)
      return { status: "error", message: "We could not save your design. Please try again." };
    revalidatePath("/account/designs");
    return { status: "saved", id: data.id, savedAt: data.updated_at };
  }

  const { data, error } = await supabase
    .from("designs")
    .insert({ ...row, owner_id: user.id })
    .select("id, updated_at")
    .single();
  if (error || !data)
    return { status: "error", message: "We could not save your design. Please try again." };
  revalidatePath("/account/designs");
  return { status: "saved", id: data.id, savedAt: data.updated_at };
}

/** Delete one of the customer's own unlocked designs (RLS + policy enforce both). */
export async function deleteDesignAction(designId: string): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user || !z.string().uuid().safeParse(designId).success) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from("designs")
    .delete({ count: "exact" })
    .eq("id", designId);
  revalidatePath("/account/designs");
  return { ok: !error && count === 1 };
}
