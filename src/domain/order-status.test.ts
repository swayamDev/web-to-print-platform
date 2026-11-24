import { describe, expect, it } from "vitest";

import {
  ORDER_FILTERS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  orderFilter,
  orderStatusLabel,
} from "./order-status";

describe("orderStatusLabel", () => {
  it("labels every status", () => {
    for (const s of ORDER_STATUSES) expect(orderStatusLabel(s)).toBe(ORDER_STATUS_LABELS[s]);
  });

  it("says when a proof has been approved", () => {
    expect(orderStatusLabel("proof", true)).toBe("Proof approved");
    expect(orderStatusLabel("proof", false)).toBe("Proof ready");
    expect(orderStatusLabel("production", true)).toBe("In production");
  });
});

describe("orderFilter", () => {
  it("maps ?show= values to statuses and falls back to all", () => {
    expect(orderFilter("active").statuses).toEqual(["order", "artwork", "proof", "production"]);
    expect(orderFilter("completed").statuses).toEqual(["completed"]);
    expect(orderFilter(undefined).key).toBe("all");
    expect(orderFilter("drop table").key).toBe("all");
  });

  it("covers every status exactly once across the specific filters", () => {
    const covered = ORDER_FILTERS.flatMap((f) => f.statuses ?? []);
    expect([...covered].sort()).toEqual([...ORDER_STATUSES].sort());
  });
});
