import { describe, expect, it } from "vitest";

import {
  loginSchema,
  profileSchema,
  resetPasswordSchema,
  safeRedirectPath,
  signupSchema,
  toFieldErrors,
} from "./auth";

describe("safeRedirectPath", () => {
  it("keeps internal paths", () => {
    expect(safeRedirectPath("/account/orders")).toBe("/account/orders");
    expect(safeRedirectPath("/p/race-numbers?qty=500")).toBe("/p/race-numbers?qty=500");
  });

  it("blocks external and protocol-relative URLs", () => {
    expect(safeRedirectPath("https://evil.example")).toBe("/account");
    expect(safeRedirectPath("//evil.example")).toBe("/account");
    expect(safeRedirectPath("/\\evil.example")).toBe("/account");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/account");
  });

  it("blocks control characters and non-strings", () => {
    expect(safeRedirectPath("/account\n")).toBe("/account");
    expect(safeRedirectPath(undefined)).toBe("/account");
    expect(safeRedirectPath(42, "/admin")).toBe("/admin");
  });

  it("does not send users back to the auth pages", () => {
    expect(safeRedirectPath("/login")).toBe("/account");
    expect(safeRedirectPath("/signup?next=/x")).toBe("/account");
  });
});

describe("auth form schemas", () => {
  it("normalises email addresses", () => {
    const parsed = loginSchema.parse({ email: "  Priya@Example.COM ", password: "x" });
    expect(parsed.email).toBe("priya@example.com");
  });

  it("rejects short passwords at signup", () => {
    const result = signupSchema.safeParse({
      fullName: "Priya",
      email: "priya@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error).password).toMatch(/at least 8/);
    }
  });

  it("requires matching passwords on reset", () => {
    const result = resetPasswordSchema.safeParse({
      password: "long-enough-1",
      confirmPassword: "different-1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error).confirmPassword).toBe("Passwords do not match.");
    }
  });

  it("accepts empty optional profile fields but rejects letters in a phone number", () => {
    expect(profileSchema.safeParse({ fullName: "", companyName: "", phone: "" }).success).toBe(
      true,
    );
    expect(
      profileSchema.safeParse({ fullName: "A", companyName: "", phone: "call me" }).success,
    ).toBe(false);
  });
});
