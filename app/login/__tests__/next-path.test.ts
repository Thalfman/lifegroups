import { describe, expect, it } from "vitest";
import { isSafeNextPath } from "@/app/login/next-path";

describe("isSafeNextPath", () => {
  it("accepts plain same-origin paths", () => {
    expect(isSafeNextPath("/admin")).toBe(true);
    expect(isSafeNextPath("/leader/123")).toBe(true);
    expect(isSafeNextPath("/admin/people?role=leader")).toBe(true);
    expect(isSafeNextPath("/")).toBe(true);
  });

  it("rejects protocol-relative URLs", () => {
    expect(isSafeNextPath("//attacker.example")).toBe(false);
    expect(isSafeNextPath("//attacker.example/admin")).toBe(false);
  });

  it("rejects backslash-prefixed variants", () => {
    expect(isSafeNextPath("/\\attacker.example")).toBe(false);
    expect(isSafeNextPath("/\\/attacker.example")).toBe(false);
  });

  it("rejects absolute URLs", () => {
    expect(isSafeNextPath("http://attacker.example")).toBe(false);
    expect(isSafeNextPath("https://attacker.example/admin")).toBe(false);
    expect(isSafeNextPath("javascript:alert(1)")).toBe(false);
  });

  it("rejects values that don't start with /", () => {
    expect(isSafeNextPath("admin")).toBe(false);
    expect(isSafeNextPath("")).toBe(false);
    expect(isSafeNextPath("./admin")).toBe(false);
  });
});
