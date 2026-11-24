/**
 * Production file names and paths (PRD p6 §07, DECISIONS D-13):
 * `production/{OrderID}/{OrderID}_{ProductType}_{Date}_{Output}`, where Date is the order's paid
 * date in UTC, so regenerating the files gives exactly the same names.
 */

export type ProductionOutput = "print.pdf" | "print.png";

const SAFE = /^[A-Za-z0-9-]+$/;

export function productionFileName(input: {
  orderNumber: string;
  productSlug: string;
  paidAt: string | Date;
  output: ProductionOutput;
}): string {
  if (!SAFE.test(input.orderNumber)) throw new Error("Invalid order number");
  if (!SAFE.test(input.productSlug)) throw new Error("Invalid product type");
  const paid = new Date(input.paidAt);
  if (Number.isNaN(paid.getTime())) throw new Error("Invalid paid date");
  const date = paid.toISOString().slice(0, 10);
  return `${input.orderNumber}_${input.productSlug}_${date}_${input.output}`;
}

export function productionPath(orderNumber: string, fileName: string): string {
  return `${orderNumber}/${fileName}`;
}
