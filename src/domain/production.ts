/**
 * Production file names and paths (PRD p6 §07, DECISIONS D-13):
 * `production/{OrderID}/{OrderID}_{ProductType}_{Date}_{Output}`, where Date is the order's paid
 * date in UTC, so regenerating the files gives exactly the same names. Variable-data orders also
 * have one file per CSV row in `{OrderID}/rows/` (Output `row-001.pdf`…) and a `rows.zip`.
 */

export type ProductionOutput =
  "print.pdf" | "print.png" | "rows.zip" | `row-${string}.pdf` | `row-${string}.png`;

const OUTPUT = /^(print\.(pdf|png)|rows\.zip|row-\d{3,4}\.(pdf|png))$/;

const SAFE = /^[A-Za-z0-9-]+$/;

export function productionFileName(input: {
  orderNumber: string;
  productSlug: string;
  paidAt: string | Date;
  output: ProductionOutput;
}): string {
  if (!SAFE.test(input.orderNumber)) throw new Error("Invalid order number");
  if (!SAFE.test(input.productSlug)) throw new Error("Invalid product type");
  if (!OUTPUT.test(input.output)) throw new Error("Invalid output");
  const paid = new Date(input.paidAt);
  if (Number.isNaN(paid.getTime())) throw new Error("Invalid paid date");
  const date = paid.toISOString().slice(0, 10);
  return `${input.orderNumber}_${input.productSlug}_${date}_${input.output}`;
}

/** Storage path; per-row files go in a `rows/` subfolder of the order's folder. */
export function productionPath(orderNumber: string, fileName: string): string {
  return /_row-\d+\.(pdf|png)$/.test(fileName)
    ? `${orderNumber}/rows/${fileName}`
    : `${orderNumber}/${fileName}`;
}
