/**
 * Production file naming (PRD p6 §07): OrderID_ProductType_Date_Output, grouped in one
 * directory per order. Date is the order's paid date in UTC (DECISIONS D-13), so regenerating
 * files always produces the same names. CSV rows are numbered from 0001 so they sort.
 *
 *   DH-2026-000123/DH-2026-000123_race-numbers_2026-11-23_print.pdf
 *   DH-2026-000123/rows/DH-2026-000123_race-numbers_2026-11-23_row-0213_print.pdf
 */
export type ProductionFileName = {
  orderNumber: string;
  productSlug: string;
  date: Date;
  output: "print" | "proof" | "preview";
  extension: "pdf" | "png" | "zip";
  rowIndex?: number;
};

const SAFE = /^[A-Za-z0-9-]+$/;

export function productionFileName(f: ProductionFileName): string {
  if (!SAFE.test(f.orderNumber) || !SAFE.test(f.productSlug)) {
    throw new Error("Order number and product slug may only contain letters, digits and hyphens");
  }
  if (
    f.rowIndex !== undefined &&
    (!Number.isInteger(f.rowIndex) || f.rowIndex < 1 || f.rowIndex > 9999)
  ) {
    throw new Error("Row index must be 1–9999");
  }
  const date = f.date.toISOString().slice(0, 10);
  const row = f.rowIndex !== undefined ? `_row-${String(f.rowIndex).padStart(4, "0")}` : "";
  return `${f.orderNumber}_${f.productSlug}_${date}${row}_${f.output}.${f.extension}`;
}

/** Storage path inside the production bucket: one folder per order, rows in a subfolder. */
export function productionFilePath(f: ProductionFileName): string {
  const name = productionFileName(f);
  return f.rowIndex !== undefined ? `${f.orderNumber}/rows/${name}` : `${f.orderNumber}/${name}`;
}
