"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { ProductEditInput } from "@/domain/catalogue-admin";
import { useHydrated } from "@/lib/use-hydrated";
import { saveProductAction } from "@/server/actions/catalogue";

type Material = { id: string; slug: string; name: string; isActive: boolean };

const input = "bg-background h-9 w-full min-w-0 rounded-md border px-2 text-sm tabular-nums";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid content-start gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

/**
 * Edit a product's prices, limits, materials and discount tiers (PRD p9 §14). Everything is
 * validated again on the server; saving refreshes the storefront and checkout at once.
 */
export function ProductForm({
  initial,
  materials,
  pricingModel,
  supportsVariableData,
  globalTiers,
  currencySymbol,
}: {
  initial: ProductEditInput;
  materials: Material[];
  pricingModel: "area" | "unit";
  supportsVariableData: boolean;
  globalTiers: { minQty: number; percentOff: string }[];
  currencySymbol: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const set = <K extends keyof ProductEditInput>(key: K, value: ProductEditInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const text = (key: keyof ProductEditInput) => ({
    value: String(form[key] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value as never),
  });
  const setMaterial = (index: number, patch: Partial<ProductEditInput["materials"][number]>) =>
    setForm((f) => ({
      ...f,
      materials: f.materials.map((m, i) => {
        if (i === index) return { ...m, ...patch };
        // Only one default: choosing one clears the others.
        return patch.isDefault ? { ...m, isDefault: false } : m;
      }),
    }));
  const setTier = (index: number, patch: Partial<ProductEditInput["tiers"][number]>) =>
    setForm((f) => ({
      ...f,
      tiers: f.tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    }));

  const save = () =>
    startTransition(async () => {
      setResult(null);
      const outcome = await saveProductAction(form);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });

  const materialName = new Map(materials.map((m) => [m.id, m]));

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      data-testid="product-form"
      data-hydrated={hydrated || undefined}
    >
      <section className="bg-card grid gap-4 rounded-xl border p-5">
        <h2 className="text-base font-semibold">Listing</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            {(id) => <input id={id} className={input} {...text("name")} />}
          </Field>
          <Field label="Short description">
            {(id) => <input id={id} className={input} {...text("shortDescription")} />}
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(form.isActive)}
            onChange={(e) => set("isActive", e.target.checked)}
            className="accent-ink size-4"
          />
          On sale (shown in the catalogue and orderable)
        </label>
      </section>

      <section className="bg-card grid gap-4 rounded-xl border p-5">
        <h2 className="text-base font-semibold">Prices (excl. tax)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={`Base price per item (${currencySymbol})`}
            hint="Added to the material price for every item."
          >
            {(id) => (
              <input id={id} inputMode="decimal" className={input} {...text("baseUnitPrice")} />
            )}
          </Field>
          <Field label={`Setup fee per order (${currencySymbol})`}>
            {(id) => <input id={id} inputMode="decimal" className={input} {...text("setupFee")} />}
          </Field>
          {supportsVariableData ? (
            <Field label={`Personalisation per item (${currencySymbol})`} hint="CSV orders only.">
              {(id) => (
                <input
                  id={id}
                  inputMode="decimal"
                  className={input}
                  {...text("variableDataUnitFee")}
                />
              )}
            </Field>
          ) : null}
        </div>

        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Materials</h3>
          <p className="text-muted-foreground text-xs">
            {pricingModel === "area"
              ? "Priced by area: the price per cm² times the item's area, plus the price per item."
              : "Priced per item."}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="py-1 font-medium">Material</th>
                  <th className="py-1 font-medium">Offered</th>
                  <th className="py-1 font-medium">Default</th>
                  <th className="py-1 font-medium">Per cm² ({currencySymbol})</th>
                  <th className="py-1 font-medium">Per item ({currencySymbol})</th>
                </tr>
              </thead>
              <tbody>
                {form.materials.map((m, i) => {
                  const info = materialName.get(m.materialId);
                  return (
                    <tr
                      key={m.materialId}
                      className="border-t"
                      data-testid={`material-${info?.slug}`}
                    >
                      <td className="py-2 pr-2">
                        {info?.name}
                        {info && !info.isActive ? (
                          <span className="text-muted-foreground"> (inactive)</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          aria-label={`Offer ${info?.name}`}
                          checked={m.offered}
                          onChange={(e) =>
                            setMaterial(i, {
                              offered: e.target.checked,
                              ...(e.target.checked ? {} : { isDefault: false }),
                            })
                          }
                          className="accent-ink size-4"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="radio"
                          name="default-material"
                          aria-label={`${info?.name} is the default`}
                          checked={m.isDefault}
                          disabled={!m.offered}
                          onChange={() => setMaterial(i, { isDefault: true })}
                          className="accent-ink size-4"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          aria-label={`${info?.name} price per cm²`}
                          inputMode="decimal"
                          className={input}
                          value={m.pricePerCm2}
                          disabled={!m.offered}
                          onChange={(e) => setMaterial(i, { pricePerCm2: e.target.value })}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          aria-label={`${info?.name} price per item`}
                          inputMode="decimal"
                          className={input}
                          value={m.pricePerUnit}
                          disabled={!m.offered}
                          onChange={(e) => setMaterial(i, { pricePerUnit: e.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-2" data-testid="tiers">
          <h3 className="text-sm font-semibold">Volume discounts</h3>
          <p className="text-muted-foreground text-xs">
            The whole order gets the discount of the highest tier it reaches.{" "}
            {form.tiers.length === 0
              ? `None set, so the shop-wide tiers apply: ${globalTiers.map((t) => `${t.minQty}+ ${Number(t.percentOff)}%`).join(", ") || "none"}.`
              : "These replace the shop-wide tiers for this product."}
          </p>
          {form.tiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <Field label="From quantity">
                {(id) => (
                  <input
                    id={id}
                    inputMode="numeric"
                    className={`${input} w-28`}
                    value={String(t.minQty)}
                    onChange={(e) => setTier(i, { minQty: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Discount %">
                {(id) => (
                  <input
                    id={id}
                    inputMode="decimal"
                    className={`${input} w-24`}
                    value={t.percentOff}
                    onChange={(e) => setTier(i, { percentOff: e.target.value })}
                  />
                )}
              </Field>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setForm((f) => ({ ...f, tiers: f.tiers.filter((_, j) => j !== i) }))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() =>
              setForm((f) => ({ ...f, tiers: [...f.tiers, { minQty: "", percentOff: "" }] }))
            }
          >
            Add a tier
          </Button>
        </div>
      </section>

      <section className="bg-card grid gap-4 rounded-xl border p-5">
        <h2 className="text-base font-semibold">Sizes and quantities</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Min width (mm)">
            {(id) => <input id={id} className={input} {...text("minWidthMm")} />}
          </Field>
          <Field label="Max width (mm)">
            {(id) => <input id={id} className={input} {...text("maxWidthMm")} />}
          </Field>
          <Field label="Default width (mm)">
            {(id) => <input id={id} className={input} {...text("defaultWidthMm")} />}
          </Field>
          <Field label="Min height (mm)">
            {(id) => <input id={id} className={input} {...text("minHeightMm")} />}
          </Field>
          <Field label="Max height (mm)">
            {(id) => <input id={id} className={input} {...text("maxHeightMm")} />}
          </Field>
          <Field label="Default height (mm)">
            {(id) => <input id={id} className={input} {...text("defaultHeightMm")} />}
          </Field>
          <Field label="Min quantity">
            {(id) => <input id={id} className={input} {...text("minQty")} />}
          </Field>
          <Field label="Max quantity">
            {(id) => <input id={id} className={input} {...text("maxQty")} />}
          </Field>
          <Field label="Quantity step">
            {(id) => <input id={id} className={input} {...text("qtyStep")} />}
          </Field>
        </div>
      </section>

      <section className="bg-card grid gap-4 rounded-xl border p-5">
        <h2 className="text-base font-semibold">Print output</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Bleed (mm)">
            {(id) => <input id={id} className={input} {...text("bleedMm")} />}
          </Field>
          <Field label="Safe margin (mm)">
            {(id) => <input id={id} className={input} {...text("safeMarginMm")} />}
          </Field>
          <Field label="Output DPI">
            {(id) => <input id={id} className={input} {...text("outputDpi")} />}
          </Field>
        </div>
        <p className="text-muted-foreground text-xs">
          Applies to new designs and orders. Orders already placed keep the settings they were
          proofed with.
        </p>
      </section>

      <div className="bg-background/90 sticky bottom-0 grid gap-2 border-t py-3 backdrop-blur">
        <Button type="submit" size="lg" className="h-11 w-fit px-6" disabled={pending}>
          {pending ? "Saving…" : "Save product"}
        </Button>
        {result ? (
          <p
            role={result.ok ? "status" : "alert"}
            className={result.ok ? "text-sm" : "text-destructive text-sm"}
            data-testid="save-result"
          >
            {result.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
