/**
 * Order pipeline stages (PRD p8 §11, DECISIONS D-05) and their customer-facing labels.
 * Allowed transitions are enforced in the database (transition_order).
 */
export const ORDER_STATUSES = [
  "quote",
  "order",
  "artwork",
  "proof",
  "production",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  quote: "Awaiting payment",
  order: "Paid",
  artwork: "Artwork check",
  proof: "Proof ready",
  production: "In production",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** The label to show, which also says when a proof is approved and the job awaits production. */
export function orderStatusLabel(status: OrderStatus, proofApproved = false): string {
  return status === "proof" && proofApproved ? "Proof approved" : ORDER_STATUS_LABELS[status];
}

/** Order-list filters for the customer dashboard (PRD p7 §09: track orders by stage). */
export const ORDER_FILTERS = [
  { key: "all", label: "All", statuses: null },
  { key: "active", label: "In progress", statuses: ["order", "artwork", "proof", "production"] },
  { key: "unpaid", label: "Awaiting payment", statuses: ["quote"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
] as const satisfies readonly {
  key: string;
  label: string;
  statuses: readonly OrderStatus[] | null;
}[];

export type OrderFilter = (typeof ORDER_FILTERS)[number];

/** The filter for a `?show=` value; unknown values show everything. */
export function orderFilter(key: string | undefined): OrderFilter {
  return ORDER_FILTERS.find((f) => f.key === key) ?? ORDER_FILTERS[0];
}
