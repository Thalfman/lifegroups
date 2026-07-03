import { describe, expect, it } from "vitest";

import { makeBooleanFlagReader } from "@/lib/shared/validation-primitives";

describe("makeBooleanFlagReader", () => {
  const readAdmin = makeBooleanFlagReader(["true", "on", "1"]);
  const readLeader = makeBooleanFlagReader(["true", "on", "1", "yes"]);

  it("passes booleans through unchanged", () => {
    expect(readAdmin(true)).toBe(true);
    expect(readAdmin(false)).toBe(false);
  });

  it("accepts only the declared vocabulary, trimmed and case-insensitive", () => {
    for (const v of ["true", "on", "1", " TRUE ", "On"]) {
      expect(readAdmin(v)).toBe(true);
    }
    for (const v of ["false", "off", "0", "", "yep"]) {
      expect(readAdmin(v)).toBe(false);
    }
  });

  it('keeps per-surface vocabularies distinct (leader accepts "yes")', () => {
    expect(readLeader("yes")).toBe(true);
    expect(readLeader(" YES ")).toBe(true);
    expect(readAdmin("yes")).toBe(false);
  });

  it("reads null, undefined, and non-strings as false", () => {
    expect(readAdmin(null)).toBe(false);
    expect(readAdmin(undefined)).toBe(false);
    expect(readAdmin(1)).toBe(false);
    expect(readAdmin({})).toBe(false);
  });
});
