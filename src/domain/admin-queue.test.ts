import { describe, expect, it } from "vitest";

import { looksLikeOrderNumber, parseQueueParams, queueHref, sanitizeSearch } from "./admin-queue";

describe("parseQueueParams", () => {
  it("reads valid filters", () => {
    expect(
      parseQueueParams({ status: "proof", ready: "1", view: "all", q: " DH-2026 ", page: "3" }),
    ).toEqual({
      status: "proof",
      awaitingFiles: true,
      view: "all",
      query: "DH-2026",
      page: 3,
    });
  });

  it("falls back to safe defaults for anything unexpected", () => {
    expect(parseQueueParams({ status: "shipped", view: "deleted", page: "-2" })).toEqual({
      status: null,
      awaitingFiles: false,
      view: "active",
      query: "",
      page: 1,
    });
    expect(parseQueueParams({ page: "abc", status: ["production", "quote"] }).status).toBe(
      "production",
    );
    expect(parseQueueParams({ q: "x".repeat(500) }).query).toHaveLength(100);
  });
});

describe("queueHref", () => {
  it("round-trips through the parser and drops defaults", () => {
    const params = parseQueueParams({
      status: "completed",
      view: "archived",
      q: "acme",
      page: "2",
    });
    expect(queueHref(params)).toBe("/admin/orders?status=completed&view=archived&q=acme&page=2");
    expect(queueHref({ view: "active", page: 1 })).toBe("/admin/orders");
  });
});

describe("search helpers", () => {
  it("tells order numbers from names", () => {
    expect(looksLikeOrderNumber("DH-2026-000007")).toBe(true);
    expect(looksLikeOrderNumber("000007")).toBe(true);
    expect(looksLikeOrderNumber("Priya")).toBe(false);
  });

  it("strips characters that could alter a filter", () => {
    expect(sanitizeSearch("acme),status.eq.(quote")).toBe("acme status eq quote");
    expect(sanitizeSearch("100%_off")).toBe("100 off");
  });
});
