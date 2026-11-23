/** Format a millimetre value without trailing zeros: 50 -> "50", 52.5 -> "52.5". */
export function formatMm(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
