import { describe, expect, it } from "vitest";

import {
  AUDIENCE_CATEGORIES,
  AUDIENCE_LABEL,
  isAudienceCategory,
} from "@/lib/admin/audience";

describe("AUDIENCE_CATEGORIES", () => {
  it("is the three top types in board order", () => {
    expect([...AUDIENCE_CATEGORIES]).toEqual(["men", "women", "mixed"]);
  });

  it("has a label for every category", () => {
    for (const c of AUDIENCE_CATEGORIES) {
      expect(AUDIENCE_LABEL[c]).toBeTruthy();
    }
  });
});

describe("isAudienceCategory", () => {
  it("accepts the three top types", () => {
    expect(isAudienceCategory("men")).toBe(true);
    expect(isAudienceCategory("women")).toBe(true);
    expect(isAudienceCategory("mixed")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isAudienceCategory("")).toBe(false);
    expect(isAudienceCategory("couples")).toBe(false);
    expect(isAudienceCategory(null)).toBe(false);
    expect(isAudienceCategory(undefined)).toBe(false);
    expect(isAudienceCategory(3)).toBe(false);
  });
});
