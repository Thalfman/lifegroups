import { describe, expect, it } from "vitest";
import {
  validateAudienceReadinessRulePayload,
  validateCellTriggerOverridePayload,
  validateReadinessRulePayload,
} from "@/lib/admin/validation/readiness-rule";
import { BUILT_IN_READINESS_RULE } from "@/lib/admin/cell-readiness";

// Write-validation tests for the readiness rule + per-cell overrides (#402). Both
// validators accept a JSON string (form submission) or an object (tests), decode
// through the pure trust-boundary decoder, and reject obviously-malformed input
// with friendly messages while the RPC stays the authoritative gate.

describe("validateReadinessRulePayload — global rule", () => {
  it("accepts a JSON-string rule with a four-digit year", () => {
    const result = validateReadinessRulePayload({
      ministry_year: "2026",
      rule: JSON.stringify({
        interest: { required: true, min: 4 },
        capacity: { required: false },
        groupHealth: { required: true, min: "B" },
        leaderHealth: { required: false, min: "C" },
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ministryYear).toBe(2026);
    expect(result.value.rule.interest).toEqual({ required: true, min: 4 });
    expect(result.value.rule.groupHealth).toEqual({ required: true, min: "B" });
  });

  it("accepts an already-parsed rule object", () => {
    const result = validateReadinessRulePayload({
      ministry_year: 2026,
      rule: { interest: { required: true, min: 2 } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rule.interest).toEqual({ required: true, min: 2 });
    // Absent pillars fall back to the built-in fragments.
    expect(result.value.rule.capacity).toEqual(
      BUILT_IN_READINESS_RULE.capacity
    );
  });

  it("rejects a non-four-digit year", () => {
    const result = validateReadinessRulePayload({
      ministry_year: "26",
      rule: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toContain("four-digit year");
  });

  it("rejects an unparseable rule payload", () => {
    const result = validateReadinessRulePayload({
      ministry_year: 2026,
      rule: "not json {",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toContain("rule must be a JSON object");
  });
});

describe("validateAudienceReadinessRulePayload — per-type rule (#410)", () => {
  it("accepts a JSON-string partial rule for a valid (year, type)", () => {
    const result = validateAudienceReadinessRulePayload({
      ministry_year: "2026",
      audience_category: "men",
      rule: JSON.stringify({ interest: { required: true, min: 5 } }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ministryYear).toBe(2026);
    expect(result.value.audienceCategory).toBe("men");
    // A partial: only the present pillar survives; absent pillars inherit global.
    expect(result.value.rule).toEqual({ interest: { required: true, min: 5 } });
    expect(result.value.rule).not.toHaveProperty("capacity");
  });

  it("accepts an empty rule object (clearing the per-type rule back to global)", () => {
    const result = validateAudienceReadinessRulePayload({
      ministry_year: 2026,
      audience_category: "women",
      rule: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rule).toEqual({});
  });

  it("drops malformed pillars but keeps the valid ones", () => {
    const result = validateAudienceReadinessRulePayload({
      ministry_year: 2026,
      audience_category: "mixed",
      rule: { capacity: { required: false }, bogus: { x: 1 } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rule).toEqual({ capacity: { required: false } });
  });

  it("rejects a non-four-digit year and a bad top type", () => {
    const result = validateAudienceReadinessRulePayload({
      ministry_year: "26",
      audience_category: "elders",
      rule: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toContain("four-digit year");
    expect(result.errors.join(" ")).toContain("top type");
  });

  it("rejects an unparseable rule payload", () => {
    const result = validateAudienceReadinessRulePayload({
      ministry_year: 2026,
      audience_category: "men",
      rule: "not json {",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toContain("rule must be a JSON object");
  });
});

describe("validateCellTriggerOverridePayload — per-cell overrides", () => {
  const CAT = "11111111-1111-1111-1111-111111111111";

  it("accepts a JSON-string override for a valid cell", () => {
    const result = validateCellTriggerOverridePayload({
      category_id: CAT,
      audience_category: "men",
      overrides: JSON.stringify({ interest: { required: true, min: 5 } }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.audienceCategory).toBe("men");
    expect(result.value.overrides).toEqual({
      interest: { required: true, min: 5 },
    });
  });

  it("accepts an empty override object (clearing all overrides)", () => {
    const result = validateCellTriggerOverridePayload({
      category_id: CAT,
      audience_category: "women",
      overrides: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.overrides).toEqual({});
  });

  it("drops malformed pillars but keeps the valid ones", () => {
    const result = validateCellTriggerOverridePayload({
      category_id: CAT,
      audience_category: "mixed",
      overrides: { capacity: { required: false }, bogus: { x: 1 } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.overrides).toEqual({ capacity: { required: false } });
  });

  it("rejects a missing category id and a bad top type", () => {
    const result = validateCellTriggerOverridePayload({
      category_id: "",
      audience_category: "elders",
      overrides: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toContain("category id");
    expect(result.errors.join(" ")).toContain("top type");
  });

  it("rejects an unparseable overrides payload", () => {
    const result = validateCellTriggerOverridePayload({
      category_id: CAT,
      audience_category: "men",
      overrides: "}{",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toContain(
      "overrides must be a JSON object"
    );
  });
});
