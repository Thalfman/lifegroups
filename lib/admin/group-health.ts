// Group-Health Grade — pure computation. No I/O, no Supabase. Mirrors the
// shape of lib/admin/metrics.ts / lib/admin/launch-planning.ts: a tunable
// config decoded from settings, plus pure functions a caller feeds bare
// objects (so tests run without a DB).
//
// Issue #127 tracer: only the *attendance-consistency* dimension is computable
// from existing data, so it is the one live leg here. The grade machinery
// (weights, cut-lines, A–D letter) is built to take all three dimensions so
// #128/#129 add spiritual-growth and the relayed group question without
// reshaping this module — but with one dimension present it grades on that
// dimension alone (weights renormalize over whatever is supplied).
//
// See docs/plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md (rubric locked 2026-05-30)
// and docs/adr/0004-systems-conversation-architecture.md (D8).

import type { GroupHealthLetter } from "@/types/enums";
import { isRecord } from "@/lib/admin/validation";

// ---------------------------------------------------------------------------
// Rubric configuration (tunable; defaults documented in the rubric).
// ---------------------------------------------------------------------------

export type GroupHealthDimensionWeights = {
  attendance: number;
  spiritual_growth: number;
  group_question: number;
};

export type GroupHealthCutLines = {
  // Internal-numeric (0–100) floors for each letter. A value at or above `a`
  // is an A; at or above `b` a B; at or above `c` a C; anything below `c` a D.
  a: number;
  b: number;
  c: number;
};

export type GroupHealthRubricConfig = {
  // Rolling attendance window, in weeks. Tunable per-dimension threshold.
  attendance_window_weeks: number;
  // Healthy-attendance % cut line (reuses default_healthy_attendance_pct).
  healthy_attendance_pct: number;
  weights: GroupHealthDimensionWeights;
  cut_lines: GroupHealthCutLines;
};

// Default weights 40 / 40 / 20 (the two named dimensions equal; the newest,
// softest signal lighter). Cut-lines and window are shipping defaults Julian
// can tune through the audited write path.
export const BUILT_IN_GROUP_HEALTH_RUBRIC: GroupHealthRubricConfig = {
  attendance_window_weeks: 8,
  healthy_attendance_pct: 60,
  weights: { attendance: 40, spiritual_growth: 40, group_question: 20 },
  cut_lines: { a: 90, b: 75, c: 60 },
};

// ---------------------------------------------------------------------------
// Attendance consistency (the one live dimension in the tracer).
// ---------------------------------------------------------------------------

// One week's attendance tally for a group, as stored by the leader check-in
// flow (attendance_sessions + attendance_records). `present/absent/excused`
// are the per-record counts for that week's session.
export type AttendanceWeekTally = {
  meeting_week: string; // ISO date (YYYY-MM-DD)
  present: number;
  absent: number;
  excused: number;
};

export type AttendanceConsistency = {
  // Rolling average attendance % over the window, or null when no week in the
  // window has any rated records.
  rolling_pct: number | null;
  // How many weeks actually contributed (≤ window).
  weeks_counted: number;
  // rolling_pct ≥ the healthy-attendance threshold.
  meets_threshold: boolean;
};

// A week's attendance %: present over everyone rated that week. Excused counts
// against the rate on purpose — the dimension measures whether people are
// actually showing up, and an excused absence is still an absence in the room
// (see the rubric's "average, not variance" rationale). Weeks with no rated
// records contribute nothing rather than a misleading 0%.
function weekAttendancePct(week: AttendanceWeekTally): number | null {
  const rated = week.present + week.absent + week.excused;
  if (rated <= 0) return null;
  return (week.present / rated) * 100;
}

export function attendanceConsistency(
  weeks: AttendanceWeekTally[],
  config: GroupHealthRubricConfig = BUILT_IN_GROUP_HEALTH_RUBRIC,
): AttendanceConsistency {
  // Most-recent weeks first, then take the window. Sorting here means callers
  // can hand us rows in any order.
  const windowed = [...weeks]
    .sort((a, b) => (a.meeting_week < b.meeting_week ? 1 : -1))
    .slice(0, config.attendance_window_weeks);

  const pcts = windowed
    .map(weekAttendancePct)
    .filter((pct): pct is number => pct !== null);

  if (pcts.length === 0) {
    return { rolling_pct: null, weeks_counted: 0, meets_threshold: false };
  }

  const rollingPct = pcts.reduce((sum, pct) => sum + pct, 0) / pcts.length;
  return {
    rolling_pct: rollingPct,
    weeks_counted: pcts.length,
    meets_threshold: rollingPct >= config.healthy_attendance_pct,
  };
}

// ---------------------------------------------------------------------------
// Rated dimensions (#128): admin-entered 1–5 → 0–100 dimension score.
// ---------------------------------------------------------------------------

// The two net-new dimensions — spiritual growth and the relayed group question
// — are captured as a 1–5 rating, but the grade math works in 0–100 like the
// attendance dimension. Map linearly with the floor at the bottom of the scale:
// a 1 contributes nothing, a 3 is a middling 50, a 5 is full marks, so the five
// steps spread across the whole range and a rating moves the letter grade.
export function ratingToScore(rating: number): number {
  return ((rating - 1) / 4) * 100;
}

// ---------------------------------------------------------------------------
// Grade computation (weighted dimensions → internal numeric → A–D letter).
// ---------------------------------------------------------------------------

// Each dimension contributes a 0–100 score. Omit a dimension (undefined) when
// it has no input for the period; its weight is dropped and the remaining
// weights renormalize, so the tracer grades on attendance alone.
export type GroupHealthDimensionScores = {
  attendance?: number;
  spiritual_growth?: number;
  group_question?: number;
};

export type ComputedGrade = {
  // Weighted 0–100 internal numeric, or null when no dimension has a score.
  numeric: number | null;
  // A–D letter from the cut-lines, or null when numeric is null.
  letter: GroupHealthLetter | null;
};

// The raw per-dimension inputs as they sit on an assessment row: a 0–100
// attendance % and the two admin-entered 1–5 ratings, any of which may be
// absent (null) for the period.
export type GroupHealthDimensionInputs = {
  attendance_pct: number | null;
  spiritual_growth_score: number | null;
  group_question_score: number | null;
};

// Normalize the raw inputs into the 0–100 dimension scores computeGrade
// consumes: attendance passes through, the 1–5 ratings go through
// ratingToScore, and an absent dimension is omitted so its weight renormalizes
// away. The single place attendance-vs-rating scales are reconciled, shared by
// the live read overview and the recompute write path.
export function dimensionScoresFromInputs(
  inputs: GroupHealthDimensionInputs,
): GroupHealthDimensionScores {
  const scores: GroupHealthDimensionScores = {};
  if (inputs.attendance_pct !== null) scores.attendance = inputs.attendance_pct;
  if (inputs.spiritual_growth_score !== null) {
    scores.spiritual_growth = ratingToScore(inputs.spiritual_growth_score);
  }
  if (inputs.group_question_score !== null) {
    scores.group_question = ratingToScore(inputs.group_question_score);
  }
  return scores;
}

function letterFor(numeric: number, cutLines: GroupHealthCutLines): GroupHealthLetter {
  if (numeric >= cutLines.a) return "A";
  if (numeric >= cutLines.b) return "B";
  if (numeric >= cutLines.c) return "C";
  return "D";
}

export function computeGrade(
  scores: GroupHealthDimensionScores,
  config: GroupHealthRubricConfig = BUILT_IN_GROUP_HEALTH_RUBRIC,
): ComputedGrade {
  // Pair each present dimension with its weight; a dimension with no score for
  // the period is dropped and its weight excluded, so the remaining weights
  // renormalize over what we actually have (the tracer grades on attendance
  // alone, #128/#129 fill in the other two).
  const present: Array<{ score: number; weight: number }> = [];
  if (scores.attendance !== undefined) {
    present.push({ score: scores.attendance, weight: config.weights.attendance });
  }
  if (scores.spiritual_growth !== undefined) {
    present.push({ score: scores.spiritual_growth, weight: config.weights.spiritual_growth });
  }
  if (scores.group_question !== undefined) {
    present.push({ score: scores.group_question, weight: config.weights.group_question });
  }

  const totalWeight = present.reduce((sum, d) => sum + d.weight, 0);
  if (present.length === 0 || totalWeight <= 0) {
    return { numeric: null, letter: null };
  }

  const numeric = present.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight;
  return { numeric, letter: letterFor(numeric, config.cut_lines) };
}

// ---------------------------------------------------------------------------
// Tunable rubric configuration (#129 / ADR 0004 D8).
//
// The healthy-attendance threshold lives in its canonical home
// (metric_defaults.default_healthy_attendance_pct) and is overlaid by the read
// path; the weights / cut-lines / attendance window are decoded here from the
// audited group_health_rubric setting.
// ---------------------------------------------------------------------------

// Decode an admin-tuned rubric from a settings JSON value (app_settings, the
// same trust seam decodeMetricDefaults uses), merging over the built-in rubric
// so a missing or partial setting still yields a complete, usable config. A
// non-object value (no row yet, corrupt JSON) decodes to the built-in defaults.
export function decodeGroupHealthRubric(raw: unknown): GroupHealthRubricConfig {
  const source = isRecord(raw) ? raw : null;
  if (!source) return { ...BUILT_IN_GROUP_HEALTH_RUBRIC };

  return {
    attendance_window_weeks: readNumber(
      source,
      "attendance_window_weeks",
      BUILT_IN_GROUP_HEALTH_RUBRIC.attendance_window_weeks,
    ),
    healthy_attendance_pct: readNumber(
      source,
      "healthy_attendance_pct",
      BUILT_IN_GROUP_HEALTH_RUBRIC.healthy_attendance_pct,
    ),
    weights: decodeWeights(source.weights),
    cut_lines: decodeCutLines(source.cut_lines),
  };
}

function decodeWeights(raw: unknown): GroupHealthDimensionWeights {
  const source = isRecord(raw) ? raw : null;
  const def = BUILT_IN_GROUP_HEALTH_RUBRIC.weights;
  if (!source) return { ...def };
  const tuned = {
    attendance: readNumber(source, "attendance", def.attendance),
    spiritual_growth: readNumber(source, "spiritual_growth", def.spiritual_growth),
    group_question: readNumber(source, "group_question", def.group_question),
  };
  // Every weight must be non-negative and at least one positive, or computeGrade
  // has no usable total and grades to null. Reject the set wholesale otherwise.
  const values = [tuned.attendance, tuned.spiritual_growth, tuned.group_question];
  if (values.some((w) => w < 0) || values.reduce((s, w) => s + w, 0) <= 0) {
    return { ...def };
  }
  return tuned;
}

function decodeCutLines(raw: unknown): GroupHealthCutLines {
  const source = isRecord(raw) ? raw : null;
  const def = BUILT_IN_GROUP_HEALTH_RUBRIC.cut_lines;
  if (!source) return { ...def };
  const tuned = {
    a: readNumber(source, "a", def.a),
    b: readNumber(source, "b", def.b),
    c: readNumber(source, "c", def.c),
  };
  // The letter ladder only works on a strictly descending set (a > b > c).
  // A tuned set that isn't is rejected wholesale rather than graded on — a
  // half-applied ladder would silently mis-letter every group.
  if (!(tuned.a > tuned.b && tuned.b > tuned.c)) return { ...def };
  return tuned;
}

// A finite number under `key`, or the fallback when absent/invalid. Mirrors
// metrics.ts readJsonInt but accepts non-integers (cut-lines/weights may be
// fractional as the rubric is tuned).
function readNumber(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
