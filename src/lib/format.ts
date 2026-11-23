import type { CurrencyCode } from "@/domain/money";

/** Format a millimetre value without trailing zeros: 50 -> "50", 52.5 -> "52.5". */
export function formatMm(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

const LOCALE: Record<CurrencyCode, string> = { GBP: "en-GB", INR: "en-IN" };

/**
 * Format a major-unit decimal string for display, keeping sub-penny precision for unit
 * prices: "0.162" -> "£0.162", "16.2" -> "£16.20". Display only; never use for totals.
 */
export function formatMajor(amount: string, currency: CurrencyCode, maxFractionDigits = 3): string {
  return new Intl.NumberFormat(LOCALE[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFractionDigits,
  }).format(Number(amount));
}

/** Format a percentage string from the pricing engine: "10" -> "10%", "12.5" -> "12.5%". */
export function formatPercent(value: string): string {
  return `${Number(value)}%`;
}
