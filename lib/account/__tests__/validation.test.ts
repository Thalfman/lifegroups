import { describe, expect, it } from "vitest";

import { validateOwnFullName } from "@/lib/account/validation";

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
