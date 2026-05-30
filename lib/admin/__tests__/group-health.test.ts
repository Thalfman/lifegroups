import { describe, expect, it } from "vitest";

import {
  attendanceConsistency,
  BUILT_IN_GROUP_HEALTH_RUBRIC,
  computeGrade,
  type AttendanceWeekTally,
} from "@/lib/admin/group-health";

function week(
  meeting_week: string,
  present: number,
  absent: number,
  excused = 0,
): AttendanceWeekTally {
  return { meeting_week, present, absent, excused };
}

describe("attendanceConsistency — rolling 8-week average %", () => {
  it("averages weekly attendance % across the window", () => {
    // Two weeks: 8/10 = 80%, 6/10 = 60% → average 70%.
    const result = attendanceConsistency([
      week("2026-05-04", 8, 2),
      week("2026-05-11", 6, 4),
    ]);
    expect(result.rolling_pct).toBe(70);
    expect(result.weeks_counted).toBe(2);
  });

  it("only counts the most recent N weeks (window cap)", () => {
    // 9 weeks: oldest at 100%, the most recent 8 all at 50%. With an 8-week
    // window the 100% week falls out, so the average is 50, not ~55.
    const weeks: AttendanceWeekTally[] = [];
    weeks.push(week("2026-01-01", 10, 0)); // oldest, 100% — outside window
    for (let i = 0; i < 8; i++) {
      const day = String(5 + i).padStart(2, "0");
      weeks.push(week(`2026-03-${day}`, 5, 5)); // 50%
    }
    const result = attendanceConsistency(weeks);
    expect(result.weeks_counted).toBe(8);
    expect(result.rolling_pct).toBe(50);
  });

  it("skips weeks with no rated records rather than scoring them 0%", () => {
    // A holiday week the group didn't meet (0/0) must not drag the average to 0.
    const result = attendanceConsistency([
      week("2026-05-04", 8, 2), // 80%
      week("2026-05-11", 0, 0), // did not meet
    ]);
    expect(result.rolling_pct).toBe(80);
    expect(result.weeks_counted).toBe(1);
  });

  it("returns null with no usable weeks", () => {
    const result = attendanceConsistency([week("2026-05-11", 0, 0)]);
    expect(result.rolling_pct).toBeNull();
    expect(result.weeks_counted).toBe(0);
    expect(result.meets_threshold).toBe(false);
  });

  it("flags whether the rolling average meets the healthy threshold (default 60)", () => {
    const below = attendanceConsistency([week("2026-05-04", 11, 9)]); // 55%
    expect(below.rolling_pct).toBe(55);
    expect(below.meets_threshold).toBe(false);

    const at = attendanceConsistency([week("2026-05-04", 12, 8)]); // 60%
    expect(at.meets_threshold).toBe(true);
  });
});

describe("computeGrade — weighted dimensions → numeric → A–D letter", () => {
  it("grades on attendance alone when it is the only dimension (the tracer case)", () => {
    // One live dimension: the numeric is just that score; 92 ≥ cut-line a (90) → A.
    expect(computeGrade({ attendance: 92 })).toEqual({ numeric: 92, letter: "A" });
  });

  it("maps the internal numeric onto A/B/C/D by the cut-lines (default 90/75/60)", () => {
    expect(computeGrade({ attendance: 90 }).letter).toBe("A");
    expect(computeGrade({ attendance: 89 }).letter).toBe("B");
    expect(computeGrade({ attendance: 75 }).letter).toBe("B");
    expect(computeGrade({ attendance: 74 }).letter).toBe("C");
    expect(computeGrade({ attendance: 60 }).letter).toBe("C");
    expect(computeGrade({ attendance: 59 }).letter).toBe("D");
  });

  it("combines three dimensions with the default 40/40/20 weights", () => {
    // 80*.4 + 90*.4 + 50*.2 = 32 + 36 + 10 = 78 → B.
    const grade = computeGrade({
      attendance: 80,
      spiritual_growth: 90,
      group_question: 50,
    });
    expect(grade.numeric).toBeCloseTo(78);
    expect(grade.letter).toBe("B");
  });

  it("renormalizes weights over the dimensions actually present", () => {
    // Only attendance (40) + spiritual growth (40) present; the missing
    // group-question weight is dropped, so each effectively weighs 50%.
    // 80*.5 + 90*.5 = 85 → below the A cut-line (90), at/above B (75) → B.
    const grade = computeGrade({ attendance: 80, spiritual_growth: 90 });
    expect(grade.numeric).toBeCloseTo(85);
    expect(grade.letter).toBe("B");
  });

  it("returns null when no dimension has a score", () => {
    expect(computeGrade({})).toEqual({ numeric: null, letter: null });
  });

  it("honors tuned cut-lines from the config", () => {
    const config = {
      ...BUILT_IN_GROUP_HEALTH_RUBRIC,
      cut_lines: { a: 70, b: 55, c: 40 },
    };
    // 72 would be a B under defaults but an A under these cut-lines.
    expect(computeGrade({ attendance: 72 }, config).letter).toBe("A");
  });
});
