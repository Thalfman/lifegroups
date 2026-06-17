import { describe, expect, it } from "vitest";

import {
  BUILT_IN_RUBRIC_BANDS,
  computeGrade,
  decodeRubricCriteria,
  rollUpGrades,
  validateRubric,
  type Rubric,
  type RubricCriterion,
} from "@/lib/admin/health-rubric";
import type { GroupHealthLetter } from "@/types/enums";

// Pure rubric engine (#374 / ADR 0018): weight-sum validation, weighted roll-up,
// band boundaries (incl. F), and override precedence. No DB — every rule is
// exercised on bare objects.

const crit = (key: string, weight: number, label = key): RubricCriterion => ({
  key,
  label,
  weight,
});

describe("validateRubric — weight-sum gate", () => {
  it("accepts criteria whose weights total 100", () => {
    expect(validateRubric([crit("attendance", 50), crit("unity", 50)])).toEqual(
      { ok: true }
    );
  });

  it("rejects when weights total less than 100", () => {
    const result = validateRubric([crit("attendance", 40), crit("unity", 50)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("must total 100");
    }
  });

  it("rejects when weights total more than 100", () => {
    const result = validateRubric([crit("a", 60), crit("b", 60)]);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty rubric", () => {
    expect(validateRubric([]).ok).toBe(false);
  });

  it("rejects a missing label or key", () => {
    expect(validateRubric([crit("", 100, "")]).ok).toBe(false);
    expect(validateRubric([{ key: "x", label: "", weight: 100 }]).ok).toBe(
      false
    );
  });

  it("rejects duplicate keys", () => {
    const result = validateRubric([
      crit("attendance", 50),
      crit("attendance", 50, "Attendance again"),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("Duplicate");
  });

  it("rejects a negative weight", () => {
    expect(validateRubric([crit("a", -10), crit("b", 110)]).ok).toBe(false);
  });
});

describe("computeGrade — weighted roll-up", () => {
  const rubric: Rubric = {
    criteria: [crit("attendance", 60), crit("unity", 40)],
  };

  it("rolls scores up by weight into a numeric", () => {
    // 80*0.6 + 90*0.4 = 48 + 36 = 84
    const grade = computeGrade(rubric, { attendance: 80, unity: 90 });
    expect(grade.numeric).toBeCloseTo(84);
    expect(grade.letter).toBe("B");
    expect(grade.overridden).toBe(false);
  });

  it("renormalizes over present criteria when one has no score", () => {
    // Only attendance scored -> grades on attendance alone.
    const grade = computeGrade(rubric, { attendance: 95 });
    expect(grade.numeric).toBeCloseTo(95);
    expect(grade.letter).toBe("A");
  });

  it("returns null numeric + letter when nothing is scored", () => {
    const grade = computeGrade(rubric, {});
    expect(grade.numeric).toBeNull();
    expect(grade.letter).toBeNull();
  });
});

describe("computeGrade — band boundaries incl. F", () => {
  const single: Rubric = { criteria: [crit("only", 100)] };
  const letterAt = (n: number) =>
    computeGrade(single, { only: n }, undefined, BUILT_IN_RUBRIC_BANDS).letter;

  it("grades at each band floor", () => {
    expect(letterAt(90)).toBe("A");
    expect(letterAt(80)).toBe("B");
    expect(letterAt(70)).toBe("C");
    expect(letterAt(60)).toBe("D");
    expect(letterAt(59)).toBe("F");
    expect(letterAt(0)).toBe("F");
  });

  it("grades just below a floor as the lower letter", () => {
    expect(letterAt(89.9)).toBe("B");
    expect(letterAt(59.9)).toBe("F");
  });
});

describe("computeGrade — override precedence", () => {
  const rubric: Rubric = { criteria: [crit("only", 100)] };

  it("a manual override forces the letter over the computed band", () => {
    // Numeric would be an A, but the override forces an F.
    const grade = computeGrade(
      rubric,
      { only: 95 },
      { letter: "F", scope: "until_cleared" }
    );
    expect(grade.letter).toBe("F");
    expect(grade.overridden).toBe(true);
    // The underlying numeric is still reported.
    expect(grade.numeric).toBeCloseTo(95);
  });

  it("override applies even when nothing is scored", () => {
    const grade = computeGrade(
      rubric,
      {},
      { letter: "B", scope: "this_month" }
    );
    expect(grade.letter).toBe("B");
    expect(grade.overridden).toBe(true);
    expect(grade.numeric).toBeNull();
  });
});

describe("decodeRubricCriteria", () => {
  it("decodes a well-formed jsonb array", () => {
    expect(
      decodeRubricCriteria([
        { key: "a", label: "A", weight: 50 },
        { key: "b", label: "B", weight: 50 },
      ])
    ).toEqual([
      { key: "a", label: "A", weight: 50 },
      { key: "b", label: "B", weight: 50 },
    ]);
  });

  it("drops malformed entries and non-arrays", () => {
    expect(decodeRubricCriteria(null)).toEqual([]);
    expect(decodeRubricCriteria("nope")).toEqual([]);
    expect(
      decodeRubricCriteria([
        { key: "a", label: "A", weight: 50 },
        { key: "b", label: "B" }, // missing weight
        { key: 1, label: "C", weight: 50 }, // bad key type
      ])
    ).toEqual([{ key: "a", label: "A", weight: 50 }]);
  });
});

describe("rollUpGrades — average a body of A–F grades into one letter", () => {
  it("returns null for an empty array (renders as '—')", () => {
    expect(rollUpGrades([])).toBeNull();
  });

  it("returns the single grade when only one exists", () => {
    expect(rollUpGrades(["B"])).toBe("B");
  });

  it("averages GPA-style points and bands to the nearest letter", () => {
    // A(4) + C(2) = 6 / 2 = 3.0 ⇒ B.
    expect(rollUpGrades(["A", "C"])).toBe("B");
    // A(4) + A(4) + B(3) = 11 / 3 ≈ 3.67 ⇒ A.
    expect(rollUpGrades(["A", "A", "B"])).toBe("A");
    // F(0) + D(1) = 0.5 ⇒ D (half-up boundary).
    expect(rollUpGrades(["F", "D"])).toBe("D");
    // F(0) + F(0) + D(1) = 1/3 ≈ 0.33 ⇒ F.
    expect(rollUpGrades(["F", "F", "D"])).toBe("F");
  });

  it("ignores non-letter entries and treats an all-invalid array as empty", () => {
    expect(rollUpGrades(["A", "Z" as GroupHealthLetter])).toBe("A");
    expect(rollUpGrades(["Z" as GroupHealthLetter])).toBeNull();
  });
});
