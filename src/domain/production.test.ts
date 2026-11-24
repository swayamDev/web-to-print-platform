import { describe, expect, it } from "vitest";

import { productionFileName, productionPath } from "./production";

describe("production file names", () => {
  it("follow OrderID_ProductType_Date_Output with the paid date in UTC", () => {
    expect(
      productionFileName({
        orderNumber: "DH-2026-000007",
        productSlug: "custom-stickers",
        // 00:30 on the 25th in India is still the 24th in UTC.
        paidAt: "2026-11-25T00:30:00+05:30",
        output: "print.pdf",
      }),
    ).toBe("DH-2026-000007_custom-stickers_2026-11-24_print.pdf");
  });

  it("are stable: the same order always gives the same path", () => {
    const name = (paidAt: string) =>
      productionFileName({
        orderNumber: "DH-1",
        productSlug: "race-numbers",
        paidAt,
        output: "print.png",
      });
    expect(name("2026-11-24T10:00:00Z")).toBe(name("2026-11-24T10:00:00.000Z"));
    expect(productionPath("DH-1", name("2026-11-24T10:00:00Z"))).toBe(
      "DH-1/DH-1_race-numbers_2026-11-24_print.png",
    );
  });

  it("refuse values that could escape the folder", () => {
    expect(() =>
      productionFileName({
        orderNumber: "../x",
        productSlug: "a",
        paidAt: new Date(),
        output: "print.pdf",
      }),
    ).toThrow();
    expect(() =>
      productionFileName({
        orderNumber: "DH-1",
        productSlug: "a/b",
        paidAt: new Date(),
        output: "print.pdf",
      }),
    ).toThrow();
    expect(() =>
      productionFileName({
        orderNumber: "DH-1",
        productSlug: "a",
        paidAt: "not a date",
        output: "print.pdf",
      }),
    ).toThrow();
  });
});
