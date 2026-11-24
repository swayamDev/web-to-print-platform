import { describe, expect, it } from "vitest";

import { buildReport, reportPeriod, type ReportOrder } from "./reports";

const NOW = new Date("2026-11-24T15:00:00Z");

describe("reportPeriod", () => {
  it("resolves presets relative to today", () => {
    expect(reportPeriod({}, NOW)).toMatchObject({
      key: "30d",
      from: "2026-10-26",
      to: "2026-11-25",
    });
    expect(reportPeriod({ period: "month" }, NOW)).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-25",
    });
    expect(reportPeriod({ period: "last-month" }, NOW)).toMatchObject({
      from: "2026-10-01",
      to: "2026-11-01",
    });
    expect(reportPeriod({ period: "year" }, NOW)).toMatchObject({
      from: "2026-01-01",
      to: "2026-11-25",
    });
    expect(reportPeriod({ period: "last-month" }, new Date("2026-01-10T00:00:00Z"))).toMatchObject({
      from: "2025-12-01",
      to: "2026-01-01",
    });
  });

  it("accepts custom ranges, inclusive of the last day, capped at two years", () => {
    expect(reportPeriod({ from: "2026-11-01", to: "2026-11-15" }, NOW)).toMatchObject({
      key: "custom",
      from: "2026-11-01",
      to: "2026-11-16",
    });
    expect(reportPeriod({ from: "2020-01-01", to: "2026-11-15" }, NOW).from).toBe("2024-11-15");
  });

  it("ignores malformed or reversed dates", () => {
    expect(reportPeriod({ from: "2026-13-01", to: "x" }, NOW).key).toBe("30d");
    expect(reportPeriod({ from: "2026-11-15", to: "2026-11-01" }, NOW).key).toBe("30d");
  });
});

const order = (o: Partial<ReportOrder>): ReportOrder => ({
  status: "production",
  createdAt: "2026-11-10T10:00:00Z",
  paidAt: "2026-11-10T10:05:00Z",
  totalGrossMinor: 1200,
  subtotalNetMinor: 1000,
  taxMinor: 200,
  product: "Custom Stickers",
  division: "Labels & Stickers",
  quantity: 100,
  isReorder: false,
  isVariableData: false,
  ...o,
});

describe("buildReport", () => {
  const period = reportPeriod({ period: "month" }, NOW);
  const report = buildReport(
    [
      order({}),
      order({ totalGrossMinor: 2400, subtotalNetMinor: 2000, taxMinor: 400, isReorder: true }),
      order({
        product: "Race Numbers",
        division: "Race & Event Numbers",
        totalGrossMinor: 600,
        subtotalNetMinor: 500,
        taxMinor: 100,
        quantity: 12,
        isVariableData: true,
        paidAt: "2026-11-24T09:00:00Z",
      }),
      order({ status: "cancelled", totalGrossMinor: 999 }),
      order({ status: "quote", paidAt: null }),
      order({ paidAt: "2026-10-31T23:59:59Z", createdAt: "2026-10-31T23:00:00Z" }),
    ],
    period,
  );

  it("totals paid sales in the period, excluding cancelled ones", () => {
    expect(report).toMatchObject({
      paidOrders: 3,
      grossMinor: 4200,
      netMinor: 3500,
      taxMinor: 700,
      averageOrderMinor: 1400,
      itemsPrinted: 212,
      cancelledPaid: { orders: 1, grossMinor: 999 },
    });
    expect(report.reorderShare).toBeCloseTo(1 / 3);
    expect(report.variableDataShare).toBeCloseTo(1 / 3);
  });

  it("breaks sales down by division and product, largest first", () => {
    expect(report.byDivision.map((d) => [d.name, d.orders, d.grossMinor])).toEqual([
      ["Labels & Stickers", 2, 3600],
      ["Race & Event Numbers", 1, 600],
    ]);
    expect(report.byProduct[0]!.share).toBeCloseTo(3600 / 4200);
  });

  it("counts orders created in the period by stage", () => {
    expect(report.byStatus).toEqual({ production: 3, cancelled: 1, quote: 1 });
  });

  it("has one bar per day, including empty days", () => {
    expect(report.daily).toHaveLength(24);
    expect(report.daily.find((d) => d.date === "2026-11-10")).toEqual({
      date: "2026-11-10",
      grossMinor: 3600,
      orders: 2,
    });
    expect(report.daily.find((d) => d.date === "2026-11-11")!.grossMinor).toBe(0);
  });

  it("handles an empty period", () => {
    const empty = buildReport([], period);
    expect(empty).toMatchObject({ paidOrders: 0, averageOrderMinor: 0, reorderShare: 0 });
  });
});
