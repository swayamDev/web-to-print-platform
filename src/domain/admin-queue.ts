import { ORDER_STATUSES, type OrderStatus } from "./order-status";

/**
 * Admin order queue filters (PRD p8 §12: filter jobs by stage, find an order quickly), read
 * from the URL so every view can be bookmarked and shared.
 */

export const QUEUE_PAGE_SIZE = 25;

export type QueueView = "active" | "archived" | "all";

export type QueueParams = {
  status: OrderStatus | null;
  /** Proofs approved and waiting for print files (a sub-state of "proof"). */
  awaitingFiles: boolean;
  view: QueueView;
  query: string;
  page: number;
};

type Raw = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseQueueParams(raw: Raw): QueueParams {
  const status = first(raw.status);
  const view = first(raw.view);
  const page = Number.parseInt(first(raw.page) ?? "1", 10);
  const query = (first(raw.q) ?? "").trim().slice(0, 100);
  return {
    status: (ORDER_STATUSES as readonly string[]).includes(status ?? "")
      ? (status as OrderStatus)
      : null,
    awaitingFiles: first(raw.ready) === "1",
    view: view === "archived" || view === "all" ? view : "active",
    query,
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 1000) : 1,
  };
}

/** Build a queue URL, dropping defaults so links stay short. */
export function queueHref(params: Partial<QueueParams>): string {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.awaitingFiles) search.set("ready", "1");
  if (params.view && params.view !== "active") search.set("view", params.view);
  if (params.query) search.set("q", params.query);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return qs ? `/admin/orders?${qs}` : "/admin/orders";
}

/** Is the search text an order number (or part of one)? Otherwise it searches customers. */
export function looksLikeOrderNumber(query: string): boolean {
  return /^(dh-?)?[\d-]{3,}$/i.test(query.trim());
}

/** Characters that would change the meaning of a PostgREST filter are removed. */
export function sanitizeSearch(query: string): string {
  return query
    .replace(/[%_,()*\:."']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
