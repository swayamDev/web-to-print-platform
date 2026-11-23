import { describe, expect, it } from "vitest";

import { formatMinor } from "./money";

describe("formatMinor", () => {
  it("formats GBP pence as pounds", () => {
    expect(formatMinor(1620, "GBP")).toBe("£16.20");
    expect(formatMinor(34378, "GBP")).toBe("£343.78");
  });

  it("formats zero and sub-pound amounts", () => {
    expect(formatMinor(0, "GBP")).toBe("£0.00");
    expect(formatMinor(5, "GBP")).toBe("£0.05");
  });

  it("formats INR paise with Indian digit grouping", () => {
    expect(formatMinor(12345600, "INR")).toBe("₹1,23,456.00");
  });

  it("rejects non-integer amounts", () => {
    expect(() => formatMinor(16.2, "GBP")).toThrow(TypeError);
  });
});
