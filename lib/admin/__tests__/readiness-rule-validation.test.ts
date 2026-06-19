import { describe, expect, it } from "vitest";
import { validateReadinessRulePayload } from "@/lib/admin/validation/readiness-rule";
import { BUILT_IN_READINESS_RULE } from "@/lib/admin/cell-readiness";

// Write-validation tests for the global readiness rule. The validator accepts a
// JSON string (form submission) or an object (tests), decodes through the pure
// trust-boundary decoder, and rejects obviously-malformed input with friendly
// messages while the RPC stays the authoritative gate. (Per-type overrides moved
// onto the group-type config payload — see validation/group-types.ts.)

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
