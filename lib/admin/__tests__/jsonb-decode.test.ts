import { describe, expect, it } from "vitest";
import { jsonInt, jsonIntOrNull, jsonNumber } from "@/lib/admin/jsonb-decode";

describe("jsonb-decode primitives", () => {
  describe("jsonInt", () => {
    it("reads a finite integer", () => {
      expect(jsonInt({ a: 12 }, "a", 0)).toBe(12);
    });
    it("falls back on a fractional value", () => {
      expect(jsonInt({ a: 12.5 }, "a", 7)).toBe(7);
    });
    it("falls back on non-finite, absent, null, or non-number", () => {
      expect(jsonInt({ a: Infinity }, "a", 7)).toBe(7);
      expect(jsonInt({}, "a", 7)).toBe(7);
      expect(jsonInt({ a: null }, "a", 7)).toBe(7);
      expect(jsonInt({ a: "9" }, "a", 7)).toBe(7);
    });
    it("falls back on a null/undefined source", () => {
      expect(jsonInt(null, "a", 7)).toBe(7);
      expect(jsonInt(undefined, "a", 7)).toBe(7);
    });
  });

  describe("jsonIntOrNull", () => {
    it("reads a finite integer", () => {
      expect(jsonIntOrNull({ a: 12 }, "a", 0)).toBe(12);
    });
    it("resolves an explicit null to null, not the fallback", () => {
      expect(jsonIntOrNull({ a: null }, "a", 5)).toBeNull();
    });
    it("falls back on absent / fractional / non-number", () => {
      expect(jsonIntOrNull({}, "a", 5)).toBe(5);
      expect(jsonIntOrNull({ a: 1.5 }, "a", 5)).toBe(5);
      expect(jsonIntOrNull({ a: "x" }, "a", 5)).toBe(5);
    });
    it("honours a null fallback when absent", () => {
      expect(jsonIntOrNull({}, "a", null)).toBeNull();
    });
  });

  describe("jsonNumber", () => {
    it("reads integers and fractions", () => {
      expect(jsonNumber({ a: 12 }, "a", 0)).toBe(12);
      expect(jsonNumber({ a: 12.5 }, "a", 0)).toBe(12.5);
    });
    it("falls back on non-finite / absent / non-number", () => {
      expect(jsonNumber({ a: NaN }, "a", 3)).toBe(3);
      expect(jsonNumber({}, "a", 3)).toBe(3);
      expect(jsonNumber({ a: "9" }, "a", 3)).toBe(3);
    });
  });
});
