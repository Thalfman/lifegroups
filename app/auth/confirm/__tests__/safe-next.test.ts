import { describe, expect, it } from "vitest";

import { isValidOtpType, safeNext } from "../safe-next";

describe("safeNext", () => {
  it("falls back to /reset-password for empty input", () => {
    expect(safeNext(null)).toBe("/reset-password");
    expect(safeNext(undefined)).toBe("/reset-password");
    expect(safeNext("")).toBe("/reset-password");
  });

  it("allows same-origin relative paths", () => {
    expect(safeNext("/reset-password")).toBe("/reset-password");
    expect(safeNext("/account/security")).toBe("/account/security");
    expect(safeNext("/reset-password?foo=bar")).toBe("/reset-password?foo=bar");
  });

  it("rejects open-redirect attempts", () => {
    expect(safeNext("https://evil.com")).toBe("/reset-password");
    expect(safeNext("http://evil.com")).toBe("/reset-password");
    expect(safeNext("//evil.com")).toBe("/reset-password");
    expect(safeNext("/\\evil.com")).toBe("/reset-password");
    expect(safeNext("evil.com")).toBe("/reset-password");
    expect(safeNext("javascript:alert(1)")).toBe("/reset-password");
  });
});

describe("isValidOtpType", () => {
  it("accepts known OTP types", () => {
    expect(isValidOtpType("recovery")).toBe(true);
    expect(isValidOtpType("invite")).toBe(true);
    expect(isValidOtpType("email")).toBe(true);
  });

  it("rejects unknown or missing types", () => {
    expect(isValidOtpType(null)).toBe(false);
    expect(isValidOtpType("")).toBe(false);
    expect(isValidOtpType("bogus")).toBe(false);
  });
});
