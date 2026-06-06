import { describe, expect, it } from "vitest";

import {
  resolveGroupRubricGrade,
  type GroupRubricGradeInput,
} from "@/lib/admin/group-rubric-grade";
import { computeGrade, type Rubric } from "@/lib/admin/health-rubric";

// Group-Health Grade by rubric (#377 / ADR 0018, Pivot slice 4). This facade
// composes the rubric engine (#374, unit-tested in health-rubric.test.ts) with
// the override resolver (#129); the tests here are the THIN integration check
// the issue asks for — that the composed letter matches the engine, that the
// override precedence holds under both scopes, that the grade is keyed to the
// ministry year, and that partial scores renormalize. No DB — bare objects.

const rubric: Rubric = {
  criteria: [
    { key: "attendance", label: "Attendance", weight: 60 },
    { key: "unity", label: "Unity", weight: 40 },
  ],
};

// A Sep date — squarely inside ministry year 2025 (Aug 2025 → May 2026).
const SEP_2025 = "2025-09-01";

function resolve(
  partial: Partial<GroupRubricGradeInput> = {}
): ReturnType<typeof resolveGroupRubricGrade> {
  return resolveGroupRubricGrade({
    rubric,
    scores: { attendance: 80, unity: 90 },
    periodMonth: SEP_2025,
    ...partial,
  });
}

describe("resolveGroupRubricGrade — roll-up matches the engine", () => {
  it("computes the same numeric + letter the rubric engine does", () => {
    const scores = { attendance: 80, unity: 90 };
    const grade = resolve({ scores });
    const engine = computeGrade(rubric, scores);

    // 80*0.6 + 90*0.4 = 84 -> B
    expect(grade.numeric).toBeCloseTo(engine.numeric ?? Number.NaN);
    expect(grade.numeric).toBeCloseTo(84);
    expect(grade.computed_letter).toBe(engine.letter);
    expect(grade.computed_letter).toBe("B");
    expect(grade.effective_letter).toBe("B");
    expect(grade.overridden).toBe(false);
    expect(grade.override_scope).toBeNull();
  });

  it("grades an A and an F at the band edges via the engine", () => {
    expect(
      resolve({ scores: { attendance: 95, unity: 95 } }).effective_letter
    ).toBe("A");
    expect(
      resolve({ scores: { attendance: 10, unity: 20 } }).effective_letter
    ).toBe("F");
  });
});

describe("resolveGroupRubricGrade — partial scores renormalize", () => {
  it("grades on the scored criteria alone when one is missing", () => {
    const grade = resolve({ scores: { attendance: 95 } });
    // Only attendance present -> renormalizes to attendance alone.
    expect(grade.numeric).toBeCloseTo(95);
    expect(grade.computed_letter).toBe("A");
    expect(grade.effective_letter).toBe("A");
  });

  it("returns null numeric + letters when nothing is scored", () => {
    const grade = resolve({ scores: {} });
    expect(grade.numeric).toBeNull();
    expect(grade.computed_letter).toBeNull();
    expect(grade.effective_letter).toBeNull();
  });
});

describe("resolveGroupRubricGrade — override precedence by scope", () => {
  it("until_cleared forces the letter regardless of period", () => {
    // Computed would be a B; the override forces an F and stands.
    const grade = resolve({
      override: { letter: "F", scope: "until_cleared" },
      periodMonth: "2026-02-01", // a different month entirely
    });
    expect(grade.computed_letter).toBe("B");
    expect(grade.effective_letter).toBe("F");
    expect(grade.overridden).toBe(true);
    expect(grade.override_scope).toBe("until_cleared");
    // The underlying numeric is still reported alongside the override.
    expect(grade.numeric).toBeCloseTo(84);
  });

  it("this_month applies only to the month it was set for", () => {
    // Set + resolved for the same month -> active.
    const active = resolve({
      override: { letter: "A", scope: "this_month" },
      periodMonth: SEP_2025,
    });
    expect(active.effective_letter).toBe("A");
    expect(active.overridden).toBe(true);
    expect(active.override_scope).toBe("this_month");
  });

  it("a this_month override set in an earlier month has expired", () => {
    // Override carries the month it was SET for; resolving in a later month must
    // fall back to the computed letter (the read path passes the stored month).
    const expired = resolve({
      override: { letter: "A", scope: "this_month", period_month: "2025-09-01" },
      periodMonth: "2025-10-01",
    });
    expect(expired.overridden).toBe(false);
    expect(expired.override_scope).toBeNull();
    // Falls back to the computed B (80*0.6 + 90*0.4 = 84).
    expect(expired.effective_letter).toBe("B");
  });

  it("an until_cleared override set in an earlier month still stands", () => {
    const standing = resolve({
      override: {
        letter: "F",
        scope: "until_cleared",
        period_month: "2025-09-01",
      },
      periodMonth: "2026-02-01",
    });
    expect(standing.overridden).toBe(true);
    expect(standing.effective_letter).toBe("F");
  });

  it("an override applies even when nothing is scored", () => {
    const grade = resolve({
      scores: {},
      override: { letter: "C", scope: "until_cleared" },
    });
    expect(grade.computed_letter).toBeNull();
    expect(grade.effective_letter).toBe("C");
    expect(grade.overridden).toBe(true);
    expect(grade.numeric).toBeNull();
  });

  it("no override falls through to the computed letter", () => {
    const grade = resolve({ override: null });
    expect(grade.effective_letter).toBe(grade.computed_letter);
    expect(grade.overridden).toBe(false);
  });
});

describe("resolveGroupRubricGrade — ministry-year keying", () => {
  it("keys an Aug–Dec period to that calendar year's ministry year", () => {
    expect(resolve({ periodMonth: "2025-09-01" }).ministry_year).toBe(2025);
    expect(resolve({ periodMonth: "2025-12-01" }).ministry_year).toBe(2025);
  });

  it("keys a Jan–May period to the prior calendar year's ministry year", () => {
    expect(resolve({ periodMonth: "2026-02-01" }).ministry_year).toBe(2025);
    expect(resolve({ periodMonth: "2026-05-01" }).ministry_year).toBe(2025);
  });

  it("returns a null ministry year for a Jun/Jul off-season period", () => {
    expect(resolve({ periodMonth: "2025-06-01" }).ministry_year).toBeNull();
    expect(resolve({ periodMonth: "2025-07-01" }).ministry_year).toBeNull();
  });
});
