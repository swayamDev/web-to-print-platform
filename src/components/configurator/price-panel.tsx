"use client";

import { ArrowRight, Check, Link2, Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { formatMinor } from "@/domain/money";
import {
  calculatePrice,
  type PriceQuote,
  type PriceRequest,
  type PricingRules,
} from "@/domain/pricing";
import { formatMajor, formatMm, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ServerCheck } from "./use-server-price";

type Props = {
  rules: PricingRules;
  request: PriceRequest | null;
  quote: PriceQuote | null;
  serverCheck: ServerCheck;
  hasErrors: boolean;
  onPickQuantity: (quantity: number) => void;
  /** Link into the designer with this exact configuration, when it is valid. */
  designHref?: string;
};

/** Live price summary: total incl. tax, breakdown, discount ladder and server confirmation. */
export function PricePanel({
  rules,
  request,
  quote,
  serverCheck,
  hasErrors,
  onPickQuantity,
  designHref,
}: Props) {
  const currency = rules.settings.currency;
  const money = (minor: number) => formatMinor(minor, currency);
  const material = rules.materials.find((entry) => entry.slug === request?.materialSlug);

  return (
    <section
      id="price-summary"
      aria-labelledby="price-heading"
      className="bg-ink text-paper border-signal scroll-mt-20 border-t-4 p-4 sm:p-6 lg:sticky lg:top-20"
    >
      <h2 id="price-heading" className="text-paper/80 text-sm font-semibold">
        Price summary
      </h2>

      {quote ? (
        <div className="mt-3 grid gap-5">
          <div className="grid gap-1" aria-live="polite">
            <p
              key={quote.totalGrossMinor}
              data-testid="price-total"
              className="font-heading num motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 text-4xl font-bold duration-200"
            >
              {money(quote.totalGrossMinor)}
            </p>
            <p className="text-paper/70 text-sm">
              {quote.quantity.toLocaleString("en-GB")} items ·{" "}
              {formatMajor(quote.unitGrossDisplay, currency)} each · incl. {quote.taxLabel}
            </p>
          </div>

          {request && material ? (
            <p className="text-paper/80 font-mono text-xs leading-relaxed">
              {formatMm(request.widthMm)} × {formatMm(request.heightMm)} mm · {material.name}
            </p>
          ) : null}

          {quote.tier ? (
            <p className="bg-signal text-ink w-fit rounded-full px-3 py-1 text-sm font-medium">
              Volume discount: {formatPercent(quote.tier.percentOff)} off every item
            </p>
          ) : null}

          <div className="grid gap-2">
            {designHref ? (
              <a
                href={designHref}
                className="bg-signal text-ink inline-flex min-h-11 items-center justify-between gap-2 rounded-md px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Design online
                <ArrowRight aria-hidden="true" className="size-4" />
              </a>
            ) : null}
            <p className="text-paper/80 text-xs">
              Edit a template or upload artwork in the editor. You’ll review a proof before
              production.
            </p>
            <ServerStatus check={serverCheck} money={money} />
          </div>

          <dl className="border-paper/15 grid gap-1.5 border-t pt-4 text-sm">
            <Row
              label={`${quote.quantity.toLocaleString("en-GB")} × ${formatMajor(quote.unit.net, currency, 4)}`}
              value={money(quote.listNetMinor)}
            />
            {quote.discountMinor > 0 ? (
              <Row
                label={`Volume discount (${formatPercent(quote.tier!.percentOff)})`}
                value={`−${money(quote.discountMinor)}`}
              />
            ) : null}
            {quote.setupFeeMinor > 0 ? (
              <Row label="Setup (one-off)" value={money(quote.setupFeeMinor)} />
            ) : null}
            <Row label="Subtotal (excl. tax)" value={money(quote.subtotalNetMinor)} />
            <Row
              label={`${quote.taxLabel} (${formatPercent(String(Number(quote.taxRate) * 100))})`}
              value={money(quote.taxMinor)}
            />
            <Row label="Total" value={money(quote.totalGrossMinor)} strong />
          </dl>

          <TierLadder
            rules={rules}
            request={request}
            quote={quote}
            onPickQuantity={onPickQuantity}
          />

          <NextTierHint quote={quote} money={money} onPickQuantity={onPickQuantity} />
          <div className="border-paper/15 border-t pt-4">
            <CopyLinkButton />
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          <p className="font-heading text-paper/40 text-4xl font-semibold">—</p>
          <p className="text-paper/70 text-sm" role="status">
            {hasErrors ? "Fix the highlighted fields to see your price." : "Calculating…"}
          </p>
        </div>
      )}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4",
        strong && "border-paper/15 mt-1 border-t pt-2 font-semibold",
      )}
    >
      <dt className={strong ? undefined : "text-paper/70"}>{label}</dt>
      <dd className="num font-mono">{value}</dd>
    </div>
  );
}

/** "Order N more…" nudge. All-units tiers can make a bigger order cheaper in total. */
function NextTierHint({
  quote,
  money,
  onPickQuantity,
}: {
  quote: PriceQuote;
  money: (minor: number) => string;
  onPickQuantity: (q: number) => void;
}) {
  const next = quote.nextTier;
  if (!next) return null;
  const more = next.minQty - quote.quantity;
  const cheaper = next.totalGrossMinor < quote.totalGrossMinor;

  return (
    <button
      type="button"
      onClick={() => onPickQuantity(next.minQty)}
      className="border-signal/60 hover:bg-signal/10 rounded-lg border border-dashed p-3 text-left text-sm transition-colors"
    >
      {cheaper ? (
        <>
          <strong className="text-signal">
            Order {more.toLocaleString("en-GB")} more and pay less:
          </strong>{" "}
          {next.minQty.toLocaleString("en-GB")} items cost {money(next.totalGrossMinor)} in total (
          {money(quote.totalGrossMinor - next.totalGrossMinor)} less).
        </>
      ) : (
        <>
          <strong className="text-signal">
            {formatPercent(next.percentOff)} off from {next.minQty.toLocaleString("en-GB")}:
          </strong>{" "}
          add {more.toLocaleString("en-GB")} more for {money(next.totalGrossMinor)} in total.
        </>
      )}
    </button>
  );
}

/** Price per item at each discount break, for the current configuration. */
function TierLadder({
  rules,
  request,
  quote,
  onPickQuantity,
}: {
  rules: PricingRules;
  request: PriceRequest | null;
  quote: PriceQuote;
  onPickQuantity: (q: number) => void;
}) {
  if (!request || rules.tiers.length === 0) return null;
  const { minQty, maxQty } = rules.product;
  const breaks = [minQty, ...rules.tiers.map((t) => t.minQty)]
    .filter((q, i, all) => q >= minQty && q <= maxQty && all.indexOf(q) === i)
    .sort((a, b) => a - b);

  const rows = breaks
    .map((q) => {
      const result = calculatePrice(rules, { ...request, quantity: q });
      return result.ok ? { quantity: q, quote: result.quote } : null;
    })
    .filter((row): row is { quantity: number; quote: PriceQuote } => row !== null);

  const currency = rules.settings.currency;
  const activeTierMin = quote.tier?.minQty ?? minQty;

  return (
    <div className="grid gap-2">
      <h3 className="spec-label text-paper/60">Price breaks</h3>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>From</th>
            <th>Discount</th>
            <th>Each incl. tax</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const active = row.quantity === activeTierMin;
            return (
              <tr key={row.quantity} className={cn(active && "text-signal")}>
                <td className="py-1">
                  <button
                    type="button"
                    onClick={() => onPickQuantity(row.quantity)}
                    className="num font-mono underline-offset-4 hover:underline"
                  >
                    {row.quantity.toLocaleString("en-GB")}+
                  </button>
                </td>
                <td className="py-1">
                  {row.quote.tier ? `${formatPercent(row.quote.tier.percentOff)} off` : "—"}
                </td>
                <td className="num py-1 text-right font-mono">
                  {formatMajor(row.quote.unitGrossDisplay, currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ServerStatus({ check, money }: { check: ServerCheck; money: (minor: number) => string }) {
  const base = "flex items-center gap-2 text-xs";
  switch (check.state) {
    case "checking":
      return (
        <p className={cn(base, "text-paper/60")}>
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Confirming price…
        </p>
      );
    case "confirmed":
      return (
        <p className={cn(base, "text-paper/80")} data-testid="price-confirmed">
          <Check className="text-signal size-3.5" aria-hidden="true" /> Price confirmed with current
          rates
        </p>
      );
    case "changed":
      return (
        <p className={cn(base, "text-signal")} role="alert">
          <TriangleAlert className="size-3.5" aria-hidden="true" /> Rates have just changed: the
          current total is {money(check.serverTotalMinor)}. Refresh to update.
        </p>
      );
    case "unavailable":
      return (
        <p className={cn(base, "text-paper/60")}>
          <TriangleAlert className="size-3.5" aria-hidden="true" /> Could not confirm right now; the
          final price is always checked at checkout.
        </p>
      );
    default:
      return null;
  }
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="border-paper/25 hover:border-paper inline-flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
    >
      {copied ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Link2 className="size-4" aria-hidden="true" />
      )}
      {copied ? "Link copied" : "Copy link to this quote"}
    </button>
  );
}

/** Fixed bottom bar on phones so the total is always visible while configuring. */
export function MobilePriceBar({
  quote,
  hasErrors,
}: {
  quote: PriceQuote | null;
  hasErrors: boolean;
}) {
  return (
    <div className="bg-ink text-paper fixed inset-x-0 bottom-0 z-30 border-t border-white/10 px-4 py-3 lg:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div>
          <p className="spec-label text-paper/60">Total incl. {quote?.taxLabel ?? "tax"}</p>
          <p className="font-heading num text-xl font-semibold" data-testid="mobile-price-total">
            {quote
              ? formatMinor(quote.totalGrossMinor, quote.currency)
              : hasErrors
                ? "Check options"
                : "…"}
          </p>
        </div>
        <a
          href="#price-summary"
          className="bg-signal text-ink rounded-md px-4 py-2 text-sm font-medium"
        >
          View breakdown
        </a>
      </div>
    </div>
  );
}
