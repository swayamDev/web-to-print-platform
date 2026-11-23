/**
 * Money helpers.
 *
 * Rule: every money amount in this codebase is an integer number of *minor units*
 * (pence for GBP, paise for INR). Never use floating-point currency values for totals.
 * Per-unit *rates* (which can be fractions of a penny) are handled by the pricing
 * engine with a decimal library, and only rounded to minor units at line level.
 */

export type CurrencyCode = "GBP" | "INR";

/** Number of minor units in one major unit for each supported currency. */
const MINOR_UNITS: Record<CurrencyCode, number> = {
  GBP: 100,
  INR: 100,
};

const LOCALE: Record<CurrencyCode, string> = {
  GBP: "en-GB",
  INR: "en-IN",
};

/**
 * Format an integer amount of minor units for display, e.g. 1620 GBP -> "£16.20".
 * Throws if the amount is not an integer, so float bugs surface immediately.
 */
export function formatMinor(amountMinor: number, currency: CurrencyCode): string {
  if (!Number.isInteger(amountMinor)) {
    throw new TypeError(`formatMinor expects an integer of minor units, got ${amountMinor}`);
  }
  return new Intl.NumberFormat(LOCALE[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / MINOR_UNITS[currency]);
}
