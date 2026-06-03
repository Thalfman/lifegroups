import { describe, expect, it } from "vitest";

import {
  attendanceConsistency,
  attendanceTrend,
  BUILT_IN_GROUP_HEALTH_RUBRIC,
  computeGrade,
  decodeGroupHealthRubric,
  dimensionScoresFromInputs,
  gradeAtOrBelow,
  ratingToScore,
  type AttendanceWeekTally,
} from "@/lib/admin/group-health";

function week(
  meeting_week: string,
  present: number,
  absent: number,
  excused = 0
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
    // Percentage arithmetic (11/20*100) lands at 55.00000000000001 in IEEE-754,
    // so compare with tolerance rather than exact equality.
    expect(below.rolling_pct).toBeCloseTo(55);
    expect(below.meets_threshold).toBe(false);

    const at = attendanceConsistency([week("2026-05-04", 12, 8)]); // 60%
    expect(at.meets_threshold).toBe(true);
  });
});

describe("ratingToScore — admin 1–5 rating onto the 0–100 dimension scale", () => {
  it("maps the midpoint rating to the middle of the scale", () => {
    // A 3 of 5 is a middling read, worth half the dimension.
    expect(ratingToScore(3)).toBe(50);
  });

  it("floors the worst rating at 0 and tops the best at 100", () => {
    // A 1 contributes nothing to the grade; a 5 is full marks.
    expect(ratingToScore(1)).toBe(0);
    expect(ratingToScore(5)).toBe(100);
  });

  it("steps evenly between the extremes", () => {
    expect(ratingToScore(2)).toBe(25);
    expect(ratingToScore(4)).toBe(75);
  });
});

describe("dimensionScoresFromInputs — assessment row → 0–100 dimension scores", () => {
  it("passes attendance through and converts the two 1–5 ratings", () => {
    expect(
      dimensionScoresFromInputs({
        attendance_pct: 82,
        spiritual_growth_score: 4,
        group_question_score: 3,
      })
    ).toEqual({ attendance: 82, spiritual_growth: 75, group_question: 50 });
  });

  it("omits any dimension with no input so its weight renormalizes away", () => {
    // Attendance present, both ratings absent: the tracer case, attendance only.
    expect(
      dimensionScoresFromInputs({
        attendance_pct: 70,
        spiritual_growth_score: null,
        group_question_score: null,
      })
    ).toEqual({ attendance: 70 });
  });
});

describe("computeGrade — weighted dimensions → numeric → A–D letter", () => {
  it("grades on attendance alone when it is the only dimension (the tracer case)", () => {
    // One live dimension: the numeric is just that score; 92 ≥ cut-line a (90) → A.
    expect(computeGrade({ attendance: 92 })).toEqual({
      numeric: 92,
      letter: "A",
    });
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

  it("folds the admin 1–5 ratings in through ratingToScore (#128)", () => {
    // A group acing attendance (95) but rated a 2 for spiritual growth and a 1
    // for the group question is not an A. 95*.4 + ratingToScore(2)*.4 +
    // ratingToScore(1)*.2 = 38 + 10 + 0 = 48 → D, not the A attendance alone
    // would earn.
    const grade = computeGrade({
      attendance: 95,
      spiritual_growth: ratingToScore(2),
      group_question: ratingToScore(1),
    });
    expect(grade.numeric).toBeCloseTo(48);
    expect(grade.letter).toBe("D");
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

describe("decodeGroupHealthRubric — tunable rubric from settings", () => {
  it("falls back to the built-in rubric for missing or non-object settings", () => {
    expect(decodeGroupHealthRubric(null)).toEqual(BUILT_IN_GROUP_HEALTH_RUBRIC);
    expect(decodeGroupHealthRubric(undefined)).toEqual(
      BUILT_IN_GROUP_HEALTH_RUBRIC
    );
    expect(decodeGroupHealthRubric("nope")).toEqual(
      BUILT_IN_GROUP_HEALTH_RUBRIC
    );
    expect(decodeGroupHealthRubric(42)).toEqual(BUILT_IN_GROUP_HEALTH_RUBRIC);
  });

  it("reads tuned attendance window and healthy-attendance threshold", () => {
    const rubric = decodeGroupHealthRubric({
      attendance_window_weeks: 12,
      healthy_attendance_pct: 70,
    });
    expect(rubric.attendance_window_weeks).toBe(12);
    expect(rubric.healthy_attendance_pct).toBe(70);
    // Untouched fields keep their built-in defaults.
    expect(rubric.weights).toEqual(BUILT_IN_GROUP_HEALTH_RUBRIC.weights);
    expect(rubric.cut_lines).toEqual(BUILT_IN_GROUP_HEALTH_RUBRIC.cut_lines);
  });

  it("reads tuned dimension weights, filling absent ones from defaults", () => {
    const rubric = decodeGroupHealthRubric({
      weights: { attendance: 60, group_question: 10 },
    });
    expect(rubric.weights.attendance).toBe(60);
    expect(rubric.weights.group_question).toBe(10);
    // spiritual_growth wasn't supplied — keeps its default.
    expect(rubric.weights.spiritual_growth).toBe(
      BUILT_IN_GROUP_HEALTH_RUBRIC.weights.spiritual_growth
    );
  });

  it("reads tuned A/B/C cut-lines, filling absent ones from defaults", () => {
    const rubric = decodeGroupHealthRubric({ cut_lines: { a: 85, c: 50 } });
    expect(rubric.cut_lines.a).toBe(85);
    expect(rubric.cut_lines.c).toBe(50);
    expect(rubric.cut_lines.b).toBe(BUILT_IN_GROUP_HEALTH_RUBRIC.cut_lines.b);
  });

  it("rejects non-descending cut-lines, keeping the built-in ladder intact", () => {
    // a must be > b > c; this set would make every score an A. Reject wholesale
    // rather than grade on a broken ladder.
    const rubric = decodeGroupHealthRubric({
      cut_lines: { a: 50, b: 75, c: 60 },
    });
    expect(rubric.cut_lines).toEqual(BUILT_IN_GROUP_HEALTH_RUBRIC.cut_lines);
  });

  it("rejects a weight set that can't grade (negative or all-zero)", () => {
    // A negative weight or a set summing to zero leaves computeGrade with no
    // usable total — fall back to the built-in weights rather than ungradeable.
    expect(
      decodeGroupHealthRubric({
        weights: { attendance: -5, spiritual_growth: 40, group_question: 20 },
      }).weights
    ).toEqual(BUILT_IN_GROUP_HEALTH_RUBRIC.weights);
    expect(
      decodeGroupHealthRubric({
        weights: { attendance: 0, spiritual_growth: 0, group_question: 0 },
      }).weights
    ).toEqual(BUILT_IN_GROUP_HEALTH_RUBRIC.weights);
  });
});

describe("gradeAtOrBelow (Admin IM 05 Watch grade leg)", () => {
  it("treats the same grade or a worse one as at-or-below the threshold", () => {
    // Threshold C → C and D are watched.
    expect(gradeAtOrBelow("C", "C")).toBe(true);
    expect(gradeAtOrBelow("D", "C")).toBe(true);
    // A and B are above the threshold.
    expect(gradeAtOrBelow("B", "C")).toBe(false);
    expect(gradeAtOrBelow("A", "C")).toBe(false);
  });

  it("never matches an ungraded group", () => {
    expect(gradeAtOrBelow(null, "C")).toBe(false);
    expect(gradeAtOrBelow(null, "D")).toBe(false);
  });

  it("honours a stricter or looser threshold", () => {
    // Threshold B → B, C, D watched; A clear.
    expect(gradeAtOrBelow("B", "B")).toBe(true);
    expect(gradeAtOrBelow("A", "B")).toBe(false);
    // Threshold D → only D watched.
    expect(gradeAtOrBelow("C", "D")).toBe(false);
    expect(gradeAtOrBelow("D", "D")).toBe(true);
  });
});

describe("attendanceTrend (Admin IM 05 declining-attendance leg)", () => {
  // Eight consecutive weeks, newest first. Helper builds present/absent so the
  // weekly attendance % is exactly `pct`.
  function weeksWithPcts(pcts: number[]): AttendanceWeekTally[] {
    return pcts.map((pct, i) => {
      const present = pct; // out of 100 rated
      return week(
        `2026-05-${String(31 - i).padStart(2, "0")}`,
        present,
        100 - present
      );
    });
  }

  it("flags a recent window that drops below the prior by ≥ the margin", () => {
    // Recent 4 avg 60, prior 4 avg 80 → a 20-point drop ≥ a 10-point margin.
    const trend = attendanceTrend(
      weeksWithPcts([60, 60, 60, 60, 80, 80, 80, 80]),
      10
    );
    expect(trend.recent_pct).toBe(60);
    expect(trend.prior_pct).toBe(80);
    expect(trend.declining).toBe(true);
  });

  it("does not flag a drop smaller than the margin", () => {
    // Recent 75, prior 80 → only a 5-point drop, under the 10-point margin.
    const trend = attendanceTrend(
      weeksWithPcts([75, 75, 75, 75, 80, 80, 80, 80]),
      10
    );
    expect(trend.declining).toBe(false);
  });

  it("does not flag rising or flat attendance", () => {
    const rising = attendanceTrend(
      weeksWithPcts([90, 90, 90, 90, 60, 60, 60, 60]),
      10
    );
    expect(rising.declining).toBe(false);
  });

  it("treats insufficient data (fewer than two full windows) as not declining", () => {
    // Only five recorded weeks: the prior window can't be filled, so we report
    // not-declining rather than inventing a trend.
    const trend = attendanceTrend(weeksWithPcts([50, 50, 50, 50, 90]), 10);
    expect(trend.prior_pct).toBeNull();
    expect(trend.declining).toBe(false);
  });

  it("honours the margin at the boundary (drop exactly equal to the margin)", () => {
    const trend = attendanceTrend(
      weeksWithPcts([70, 70, 70, 70, 80, 80, 80, 80]),
      10
    );
    expect(trend.declining).toBe(true);
  });

  it("does not treat flat attendance as declining at a zero margin", () => {
    // marginPct 0 is a valid setting; flat (recent == prior) must not flag.
    const flat = attendanceTrend(
      weeksWithPcts([70, 70, 70, 70, 70, 70, 70, 70]),
      0
    );
    expect(flat.declining).toBe(false);
    // A real drop at a zero margin still flags.
    const drop = attendanceTrend(
      weeksWithPcts([69, 69, 69, 69, 70, 70, 70, 70]),
      0
    );
    expect(drop.declining).toBe(true);
  });
});
