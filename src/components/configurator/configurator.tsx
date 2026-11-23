"use client";

import { ArrowLeftRight, Minus, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  calculatePrice,
  orientationOf,
  type PriceError,
  type PriceRequest,
  type PricingRules,
} from "@/domain/pricing";
import { formatMajor, formatMm } from "@/lib/format";
import { cn } from "@/lib/utils";

import { MobilePriceBar, PricePanel } from "./price-panel";
import { useServerPrice } from "./use-server-price";

export type SizePreset = { label: string; width_mm: number; height_mm: number };

export type ConfiguratorProps = {
  rules: PricingRules;
  presets: SizePreset[];
  allowCustomSize: boolean;
  defaultWidthMm: number;
  defaultHeightMm: number;
  materialDescriptions: Record<string, string | null>;
  /** Template the designer starts from, if the product has one. */
  designTemplateId?: string;
};

type State = {
  width: string;
  height: string;
  materialSlug: string;
  quantity: string;
  options: Record<string, string>;
  variableData: boolean;
};

/** Read a starting configuration from the URL (?w=&h=&m=&q=&vd=1&opt.ink=red), else defaults. */
function initialState(props: ConfiguratorProps, params: URLSearchParams): State {
  const { rules } = props;
  const defaultMaterial =
    rules.materials.find((m) => m.isDefault)?.slug ?? rules.materials[0]?.slug ?? "";
  const defaultQty =
    rules.product.minQty <= 100 && rules.product.maxQty >= 100 ? 100 : rules.product.minQty;

  const options: Record<string, string> = {};
  for (const option of rules.options) {
    const fromUrl = params.get(`opt.${option.key}`);
    const value =
      option.values.find((v) => v.value === fromUrl) ??
      option.values.find((v) => v.isDefault) ??
      option.values[0];
    if (value) options[option.key] = value.value;
  }

  const material = params.get("m");
  return {
    width: params.get("w") ?? String(props.defaultWidthMm),
    height: params.get("h") ?? String(props.defaultHeightMm),
    materialSlug: rules.materials.some((m) => m.slug === material) ? material! : defaultMaterial,
    quantity: params.get("q") ?? String(defaultQty),
    options,
    variableData: rules.product.supportsVariableData && params.get("vd") === "1",
  };
}

const parseNumber = (value: string) => {
  const n = Number(value.trim().replace(",", "."));
  return value.trim() !== "" && Number.isFinite(n) ? n : null;
};

/**
 * Product configurator (PRD p4 §04, p5 §05): size, material, options, personalisation and
 * quantity, priced instantly in the browser with the shared engine and confirmed by the
 * server. The configuration lives in the URL so it can be shared or resumed after login.
 */
export function Configurator(props: ConfiguratorProps) {
  const { rules, presets, allowCustomSize } = props;
  const searchParams = useSearchParams();
  const [state, setState] = useState<State>(() => initialState(props, searchParams));
  const set = (patch: Partial<State>) => setState((s) => ({ ...s, ...patch }));

  const width = parseNumber(state.width);
  const height = parseNumber(state.height);
  const quantity = parseNumber(state.quantity);

  const inputErrors: PriceError[] = [];
  if (width === null) inputErrors.push({ field: "widthMm", message: "Enter a width in mm." });
  if (height === null) inputErrors.push({ field: "heightMm", message: "Enter a height in mm." });
  if (quantity === null || !Number.isInteger(quantity) || quantity < 1) {
    inputErrors.push({ field: "quantity", message: "Enter a whole number of items." });
  }

  const request: PriceRequest | null =
    inputErrors.length === 0
      ? {
          productSlug: rules.product.slug,
          widthMm: width!,
          heightMm: height!,
          materialSlug: state.materialSlug,
          quantity: quantity!,
          options: state.options,
          variableData: state.variableData,
        }
      : null;

  // Instant price in the browser; React Compiler memoises this automatically.
  const result = request ? calculatePrice(rules, request) : null;
  const quote = result?.ok ? result.quote : null;
  const errors = result && !result.ok ? result.errors : inputErrors;
  const errorFor = (field: PriceError["field"]) => errors.find((e) => e.field === field)?.message;

  const serverCheck = useServerPrice(quote ? request : null, quote?.totalGrossMinor ?? null);

  // Keep the URL in step with the configuration (shareable, survives login and refresh).
  useEffect(() => {
    const params = new URLSearchParams({
      w: state.width,
      h: state.height,
      m: state.materialSlug,
      q: state.quantity,
    });
    if (state.variableData) params.set("vd", "1");
    for (const [key, value] of Object.entries(state.options)) params.set(`opt.${key}`, value);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [state]);

  const orientation = width && height ? orientationOf(width, height) : null;
  const canRotate =
    allowCustomSize &&
    rules.product.orientations.length > 1 &&
    width !== null &&
    height !== null &&
    width !== height;

  const quantityChips = [rules.product.minQty, 100, 250, 500, 1000]
    .filter(
      (q, i, all) => q >= rules.product.minQty && q <= rules.product.maxQty && all.indexOf(q) === i,
    )
    .sort((a, b) => a - b);

  const currency = rules.settings.currency;
  const perUnitLabel = (price: string) =>
    Number(price) === 0 ? "Included" : `+${formatMajor(price, currency)} each`;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-start">
      <form
        className="grid gap-6"
        onSubmit={(event) => event.preventDefault()}
        aria-label={`Configure ${rules.product.name}`}
      >
        {/* Size ------------------------------------------------------------- */}
        <fieldset className="grid gap-3">
          <legend className="spec-label text-muted-foreground mb-3">01 · Size</legend>
          {presets.length > 0 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Popular sizes">
              {presets.map((preset) => {
                const active =
                  (width === preset.width_mm && height === preset.height_mm) ||
                  (width === preset.height_mm && height === preset.width_mm);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      set({ width: String(preset.width_mm), height: String(preset.height_mm) })
                    }
                    className={cn(
                      "num rounded-md border px-3 py-1.5 font-mono text-sm transition-colors",
                      active ? "border-ink bg-ink text-paper" : "bg-card hover:border-ink",
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {allowCustomSize ? (
            <div className="flex flex-wrap items-end gap-3">
              <NumberField
                id="width"
                label="Width (mm)"
                value={state.width}
                onChange={(v) => set({ width: v })}
                error={errorFor("widthMm")}
                hint={`${formatMm(rules.product.minWidthMm)}–${formatMm(rules.product.maxWidthMm)}`}
              />
              <span aria-hidden="true" className="text-muted-foreground pb-2.5">
                ×
              </span>
              <NumberField
                id="height"
                label="Height (mm)"
                value={state.height}
                onChange={(v) => set({ height: v })}
                error={errorFor("heightMm")}
                hint={`${formatMm(rules.product.minHeightMm)}–${formatMm(rules.product.maxHeightMm)}`}
              />
              {canRotate ? (
                <button
                  type="button"
                  onClick={() => set({ width: state.height, height: state.width })}
                  className="bg-card hover:border-ink mb-0.5 inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm"
                >
                  <ArrowLeftRight className="size-4" aria-hidden="true" />
                  Rotate
                </button>
              ) : null}
            </div>
          ) : null}
          {orientation ? (
            <p className="text-muted-foreground text-sm">
              {orientation === "portrait" ? "Portrait" : "Landscape"}
              {width === height ? " (square)" : ""}
            </p>
          ) : null}
        </fieldset>

        {/* Material ---------------------------------------------------------- */}
        <fieldset className="grid gap-2">
          <legend className="spec-label text-muted-foreground mb-3">02 · Material</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {rules.materials.map((material) => (
              <ChoiceCard
                key={material.slug}
                name="material"
                value={material.slug}
                checked={state.materialSlug === material.slug}
                onChange={() => set({ materialSlug: material.slug })}
                title={material.name}
                description={props.materialDescriptions[material.slug] ?? undefined}
              />
            ))}
          </div>
          {errorFor("materialSlug") ? (
            <p className="text-destructive text-xs">{errorFor("materialSlug")}</p>
          ) : null}
        </fieldset>

        {/* Options ----------------------------------------------------------- */}
        {rules.options.map((option, index) => (
          <fieldset key={option.key} className="grid gap-2">
            <legend className="spec-label text-muted-foreground mb-3">
              {String(index + 3).padStart(2, "0")} · {option.label}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {option.values.map((value) => (
                <ChoiceCard
                  key={value.value}
                  name={`option-${option.key}`}
                  value={value.value}
                  checked={state.options[option.key] === value.value}
                  onChange={() => set({ options: { ...state.options, [option.key]: value.value } })}
                  title={value.label}
                  description={perUnitLabel(value.pricePerUnit)}
                />
              ))}
            </div>
          </fieldset>
        ))}

        {/* Personalisation --------------------------------------------------- */}
        {rules.product.supportsVariableData ? (
          <fieldset className="grid gap-2">
            <legend className="spec-label text-muted-foreground mb-3">
              {String(rules.options.length + 3).padStart(2, "0")} · Personalise
            </legend>
            <label className="bg-card has-[:checked]:border-ink flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                className="accent-signal mt-1 size-4"
                checked={state.variableData}
                onChange={(event) => set({ variableData: event.target.checked })}
              />
              <span className="grid gap-0.5">
                <span className="font-medium">Different name and number on every item</span>
                <span className="text-muted-foreground text-sm">
                  Upload a CSV of entries after ordering; we print one design per row.{" "}
                  {perUnitLabel(rules.product.variableDataUnitFee)}.
                </span>
              </span>
            </label>
          </fieldset>
        ) : null}

        {/* Quantity ---------------------------------------------------------- */}
        <fieldset className="grid gap-3">
          <legend className="spec-label text-muted-foreground mb-3">
            {String(rules.options.length + (rules.product.supportsVariableData ? 4 : 3)).padStart(
              2,
              "0",
            )}{" "}
            · Quantity
          </legend>
          <div className="flex flex-wrap items-start gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="quantity" className="text-sm font-medium">
                How many?
              </label>
              <div className="flex items-center">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() =>
                    set({
                      quantity: String(
                        Math.max(
                          rules.product.minQty,
                          (quantity ?? rules.product.minQty) - rules.product.qtyStep,
                        ),
                      ),
                    })
                  }
                  className="bg-card hover:bg-muted grid size-10 place-items-center rounded-l-md border"
                >
                  <Minus className="size-4" aria-hidden="true" />
                </button>
                <input
                  id="quantity"
                  inputMode="numeric"
                  value={state.quantity}
                  onChange={(event) => set({ quantity: event.target.value })}
                  aria-invalid={errorFor("quantity") ? true : undefined}
                  aria-describedby={errorFor("quantity") ? "quantity-error" : undefined}
                  className="num bg-card aria-invalid:border-destructive focus-visible:ring-ring/50 h-10 w-24 border-y text-center font-mono outline-none focus-visible:ring-3"
                />
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() =>
                    set({
                      quantity: String(
                        Math.min(rules.product.maxQty, (quantity ?? 0) + rules.product.qtyStep),
                      ),
                    })
                  }
                  className="bg-card hover:bg-muted grid size-10 place-items-center rounded-r-md border"
                >
                  <Plus className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-6" role="group" aria-label="Quick quantities">
              {quantityChips.map((q) => (
                <button
                  key={q}
                  type="button"
                  aria-pressed={quantity === q}
                  onClick={() => set({ quantity: String(q) })}
                  className={cn(
                    "num rounded-md border px-3 py-1.5 font-mono text-sm transition-colors",
                    quantity === q ? "border-ink bg-ink text-paper" : "bg-card hover:border-ink",
                  )}
                >
                  {q.toLocaleString("en-GB")}
                </button>
              ))}
            </div>
          </div>
          {errorFor("quantity") ? (
            <p id="quantity-error" className="text-destructive text-xs">
              {errorFor("quantity")}
            </p>
          ) : null}
          {errorFor("options") || errorFor("variableData") ? (
            <p className="text-destructive text-xs">
              {errorFor("options") ?? errorFor("variableData")}
            </p>
          ) : null}
        </fieldset>
      </form>

      <PricePanel
        designHref={
          quote
            ? `/design/new?${new URLSearchParams({
                product: rules.product.slug,
                ...(props.designTemplateId ? { template: props.designTemplateId } : {}),
                w: state.width,
                h: state.height,
                m: state.materialSlug,
                q: state.quantity,
                ...(state.variableData ? { vd: "1" } : {}),
                ...Object.fromEntries(
                  Object.entries(state.options).map(([k, v]) => [`opt.${k}`, v]),
                ),
              })}`
            : undefined
        }
        rules={rules}
        request={request}
        quote={quote}
        serverCheck={serverCheck}
        hasErrors={errors.length > 0}
        onPickQuantity={(q) => set({ quantity: String(q) })}
      />
      <MobilePriceBar quote={quote} hasErrors={errors.length > 0} />
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-help`}
        className="num bg-card aria-invalid:border-destructive focus-visible:ring-ring/50 h-10 w-28 rounded-md border px-3 font-mono outline-none focus-visible:ring-3"
      />
      <p
        id={`${id}-help`}
        className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}
      >
        {error ?? hint}
      </p>
    </div>
  );
}

function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  title,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description?: string;
}) {
  return (
    <label
      className={cn(
        "bg-card flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
        checked ? "border-ink ring-ink ring-1" : "hover:border-ink/40",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="accent-signal mt-1 size-4"
      />
      <span className="grid gap-0.5">
        <span className="font-medium">{title}</span>
        {description ? <span className="text-muted-foreground text-sm">{description}</span> : null}
      </span>
    </label>
  );
}
