/**
 * Order pipeline stages (PRD p8 §11, DECISIONS D-05) and their customer-facing labels.
 * The allowed transitions are added with the state machine in Phase 10.
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
