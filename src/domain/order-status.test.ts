import { describe, expect, it } from "vitest";

import { ORDER_STATUSES, ORDER_STATUS_LABELS, orderStatusLabel } from "./order-status";

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
