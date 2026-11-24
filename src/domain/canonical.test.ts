import { describe, expect, it } from "vitest";

import { canonicalJson } from "./canonical";

describe("canonicalJson", () => {
  it("ignores key order and undefined values", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: "x" }, z: undefined })).toBe(
      canonicalJson({ a: { c: "x", d: [1, 2] }, b: 1 }),
    );
  });

  it("keeps array order and distinguishes different values", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: "1" }));
  });

  it("produces plain JSON", () => {
    expect(canonicalJson({ b: [true, null], a: "é" })).toBe('{"a":"é","b":[true,null]}');
  });
});
