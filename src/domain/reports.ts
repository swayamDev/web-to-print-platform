import type { OrderStatus } from "./order-status";

/**
 * Admin reports (PRD p4 §03 "view reports", p9 §14): sales and pipeline figures for a period.
 * Pure aggregation over order rows; money stays in integer minor units.
 */

export type ReportPeriodKey = "30d" | "month" | "last-month" | "year" | "custom";

export type ReportPeriod = {
  key: ReportPeriodKey;
  label: string;
  /** Inclusive start and exclusive end, as UTC calendar days (YYYY-MM-DD). */
  from: string;
  to: string;
};

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayStart = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const validDay = (v: string | undefined) =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null;

export const PERIOD_PRESETS: { key: Exclude<ReportPeriodKey, "custom">; label: string }[] = [
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "year", label: "This year" },
];

/** Read the period from the URL (?period=… or ?from=…&to=…), relative to `now`. */
export function reportPeriod(
  raw: { period?: string; from?: string; to?: string },
  now: Date,
): ReportPeriod {
  const today = dayStart(now);
  const tomorrow = new Date(today.getTime() + DAY);
  const from = validDay(raw.from);
  const to = validDay(raw.to);
  if (raw.period === "custom" || (from && to)) {
    if (from && to && from <= to) {
      const end = iso(new Date(Date.parse(`${to}T00:00:00Z`) + DAY));
      // At most two years, so one report never scans the whole history.
      const earliest = iso(new Date(Date.parse(`${end}T00:00:00Z`) - 731 * DAY));
      const start = from < earliest ? earliest : from;
      return { key: "custom", label: `${start} to ${to}`, from: start, to: end };
    }
  }
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  switch (raw.period) {
    case "month":
      return {
        key: "month",
        label: "This month",
        from: iso(new Date(Date.UTC(y, m, 1))),
        to: iso(tomorrow),
      };
    case "last-month":
      return {
        key: "last-month",
        label: "Last month",
        from: iso(new Date(Date.UTC(y, m - 1, 1))),
        to: iso(new Date(Date.UTC(y, m, 1))),
      };
    case "year":
      return {
        key: "year",
        label: "This year",
        from: iso(new Date(Date.UTC(y, 0, 1))),
        to: iso(tomorrow),
      };
    default:
      return {
        key: "30d",
        label: "Last 30 days",
        from: iso(new Date(tomorrow.getTime() - 30 * DAY)),
        to: iso(tomorrow),
      };
  }
}

export type ReportOrder = {
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
  totalGrossMinor: number;
  subtotalNetMinor: number;
  taxMinor: number;
  product: string;
  division: string;
  quantity: number;
  isReorder: boolean;
  isVariableData: boolean;
};

export type Breakdown = { name: string; orders: number; grossMinor: number; share: number };

export type Report = {
  paidOrders: number;
  grossMinor: number;
  netMinor: number;
  taxMinor: number;
  averageOrderMinor: number;
  itemsPrinted: number;
  reorderShare: number;
  variableDataShare: number;
  cancelledPaid: { orders: number; grossMinor: number };
  byDivision: Breakdown[];
  byProduct: Breakdown[];
  /** Orders created in the period, by current stage. */
  byStatus: Partial<Record<OrderStatus, number>>;
  /** Paid revenue per day across the period (zeros included), for the chart. */
  daily: { date: string; grossMinor: number; orders: number }[];
};

const inPeriod = (ts: string | null, p: ReportPeriod) =>
  ts !== null && ts >= `${p.from}T00:00:00Z` && ts < `${p.to}T00:00:00Z`;

function breakdown(
  rows: ReportOrder[],
  key: (o: ReportOrder) => string,
  total: number,
): Breakdown[] {
  const groups = new Map<string, { orders: number; grossMinor: number }>();
  for (const o of rows) {
    const g = groups.get(key(o)) ?? { orders: 0, grossMinor: 0 };
    g.orders += 1;
    g.grossMinor += o.totalGrossMinor;
    groups.set(key(o), g);
  }
  return [...groups]
    .map(([name, g]) => ({ name, ...g, share: total === 0 ? 0 : g.grossMinor / total }))
    .sort((a, b) => b.grossMinor - a.grossMinor || a.name.localeCompare(b.name));
}

/**
 * Sales = orders paid in the period (cancelled-after-payment ones are reported separately:
 * they are refunded by hand, D-16). Pipeline = orders created in the period, by stage.
 */
export function buildReport(orders: ReportOrder[], period: ReportPeriod): Report {
  const paidInPeriod = orders.filter((o) => inPeriod(o.paidAt, period));
  const sales = paidInPeriod.filter((o) => o.status !== "cancelled");
  const cancelled = paidInPeriod.filter((o) => o.status === "cancelled");
  const sum = (rows: ReportOrder[], f: (o: ReportOrder) => number) =>
    rows.reduce((total, o) => total + f(o), 0);

  const grossMinor = sum(sales, (o) => o.totalGrossMinor);
  const byStatus: Partial<Record<OrderStatus, number>> = {};
  for (const o of orders.filter((o) => inPeriod(o.createdAt, period))) {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
  }

  const days = new Map<string, { grossMinor: number; orders: number }>();
  for (
    let t = Date.parse(`${period.from}T00:00:00Z`);
    t < Date.parse(`${period.to}T00:00:00Z`);
    t += DAY
  ) {
    days.set(iso(new Date(t)), { grossMinor: 0, orders: 0 });
  }
  for (const o of sales) {
    const d = days.get(o.paidAt!.slice(0, 10));
    if (d) {
      d.grossMinor += o.totalGrossMinor;
      d.orders += 1;
    }
  }

  return {
    paidOrders: sales.length,
    grossMinor,
    netMinor: sum(sales, (o) => o.subtotalNetMinor),
    taxMinor: sum(sales, (o) => o.taxMinor),
    averageOrderMinor: sales.length === 0 ? 0 : Math.round(grossMinor / sales.length),
    itemsPrinted: sum(sales, (o) => o.quantity),
    reorderShare: sales.length === 0 ? 0 : sales.filter((o) => o.isReorder).length / sales.length,
    variableDataShare:
      sales.length === 0 ? 0 : sales.filter((o) => o.isVariableData).length / sales.length,
    cancelledPaid: {
      orders: cancelled.length,
      grossMinor: sum(cancelled, (o) => o.totalGrossMinor),
    },
    byDivision: breakdown(sales, (o) => o.division, grossMinor),
    byProduct: breakdown(sales, (o) => o.product, grossMinor),
    byStatus,
    daily: [...days].map(([date, d]) => ({ date, ...d })),
  };
}
