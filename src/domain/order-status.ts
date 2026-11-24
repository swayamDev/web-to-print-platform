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
