import { describe, expect, it } from "vitest";

import {
  validateDeletionRequest,
  validateOwnFullName,
} from "@/lib/account/validation";

describe("validateOwnFullName", () => {
  it("accepts a plain name and trims surrounding whitespace", () => {
    const result = validateOwnFullName("  Jordan Rivers  ");
    expect(result).toEqual({ ok: true, value: "Jordan Rivers" });
  });

  it("rejects an empty string", () => {
    const result = validateOwnFullName("");
    expect(result).toEqual({ ok: false, error: "Enter your name." });
  });

  it("rejects whitespace-only input", () => {
    const result = validateOwnFullName("   ");
    expect(result).toEqual({ ok: false, error: "Enter your name." });
  });

  it("rejects non-string input", () => {
    for (const input of [undefined, null, 42, ["A"], { name: "A" }]) {
      expect(validateOwnFullName(input).ok).toBe(false);
    }
  });

  it("accepts exactly 200 characters", () => {
    const result = validateOwnFullName("a".repeat(200));
    expect(result.ok).toBe(true);
  });

  it("rejects 201 characters", () => {
    const result = validateOwnFullName("a".repeat(201));
    expect(result).toEqual({
      ok: false,
      error: "Name is too long (200 characters max).",
    });
  });

  it("measures the cap after trimming", () => {
    const result = validateOwnFullName(`  ${"a".repeat(200)}  `);
    expect(result.ok).toBe(true);
  });
});

describe("validateDeletionRequest", () => {
  it("rejects a submit without the explicit confirmation", () => {
    for (const confirm of [undefined, null, "", "off", true]) {
      expect(validateDeletionRequest({ confirm, reason: "moving" })).toEqual({
        ok: false,
        errors: ["Please confirm you understand before requesting deletion."],
      });
    }
  });

  it("accepts a confirmed request with no reason as null", () => {
    for (const reason of [undefined, null, "", "   "]) {
      expect(validateDeletionRequest({ confirm: "on", reason })).toEqual({
        ok: true,
        value: { reason: null },
      });
    }
  });

  it("accepts a confirmed request with a trimmed reason", () => {
    expect(
      validateDeletionRequest({ confirm: "on", reason: "  moving away  " })
    ).toEqual({ ok: true, value: { reason: "moving away" } });
  });

  it("rejects a reason over the 1000-character cap", () => {
    const result = validateDeletionRequest({
      confirm: "on",
      reason: "a".repeat(1001),
    });
    expect(result).toEqual({
      ok: false,
      errors: ["Reason is too long (1000 characters max)."],
    });
  });
});
