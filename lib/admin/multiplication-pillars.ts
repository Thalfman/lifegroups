// Multiplication Pillars — pure resolver (#380 / ADR 0016, 0019). No I/O, no
// Supabase. The Multiply area shows three boards by group type (men / women /
// mixed); each board grades pillars — Interest, Group Health, Leader Health — to
// an A–F letter, and a Julian-configured TRIGGER RUBRIC over those pillars
// produces a single "ready to multiply this type" signal. There is deliberately
// NO blended overall letter: the pillars stay separate and the trigger is the
// only roll-up.
//
// CAPACITY is no longer one of these A–F pillars. As of #401 (PRD §2.4 + §4) it
// is a DERIVED, multi-faceted ISSUE computed PER CELL from group sizes (see
// lib/admin/cell-capacity.ts) — never a hand-fed numeric graded to A–F. The old
// `overflow` pillar (full-group magnitude) and the fed-capacity "offerings" were
// folded into / retired by that change. This file therefore grades only the three
// remaining A–F pillars; the capacity issue is surfaced alongside them by the
// board loader.
//
// The math lives here so every rule is isolation-testable with bare objects:
//   * Interest derives from the Interest Funnel VOLUME for that type — a count +
//     thresholds → A–F.
//   * Group Health / Leader Health roll up that type's supplied grades over the
//     Ministry Year, yielding null ("—") until any grade exists. The resolver
//     takes the grades as plain A–F arrays so the board ships and shows "—" when
//     none are fed.

import { HEALTH_GRADE_LADDER } from "@/lib/admin/health-rubric";
import type { GroupHealthLetter } from "@/types/enums";

// The A–F letter the pillars grade to. Reuses the health-rubric ladder's letter
// type so the Multiply pillars and the Health rubric share one A–F vocabulary.
export type HealthLetter = GroupHealthLetter;

// The pillar identities. Interest is always computable from a fed number; the two
// health pillars roll up supplied grades and may be null. Capacity is NOT here —
// it is the derived per-cell issue (lib/admin/cell-capacity.ts), surfaced as its
// own boolean signal, not graded A–F.
export type PillarKey = "interest" | "groupHealth" | "leaderHealth";

// The graded board for one group type: each pillar's A–F letter, or null where
// the health pillars have no grades yet (rendered as "—").
export type PillarGrades = {
  interest: HealthLetter;
  groupHealth: HealthLetter | null;
  leaderHealth: HealthLetter | null;
};

// ---------------------------------------------------------------------------
// Thresholds: the A–F cut-lines for the numeric pillar (Interest).
// ---------------------------------------------------------------------------

// Inclusive lower bounds for each letter, best → worst. A value at or above `a`
// is an A, at or above `b` a B, and so on; anything below `d` is an F. Higher
// inputs are healthier (more interest volume), so the floors descend A ≥ B ≥ C ≥ D.
export type PillarBands = {
  a: number;
  b: number;
  c: number;
  d: number;
};

// A type's full threshold configuration: one band set for the numeric pillar
// (Interest). The health pillars are graded from supplied letters, not bands, so
// they need none; capacity is a derived issue, not a banded grade.
export type PillarThresholds = {
  interest: PillarBands;
};

// The plain inputs the resolver grades. Grade arrays are A–F letters as the
// parallel grade-storage slices will supply them; empty arrays yield "—".
export type PillarInputs = {
  // The interest volume for this type (#399): the count of prospects in state
  // `interested` (not matched/joined/not_at_this_time, not archived) whose
  // DESIRED top type — named at intake — is this type. Drives the Interest
  // pillar. (Was the count attached to a group of this type, before #399.)
  funnelVolume: number;
  // This type's group-health grades within the Ministry Year (A–F). Empty ⇒ "—".
  groupGrades: HealthLetter[];
  // This type's leader-health grades within the Ministry Year (A–F). Empty ⇒ "—".
  leaderGrades: HealthLetter[];
};

// Built-in default bands. Interest defaults to a simple 4/3/2/1 ladder (e.g. "4+
// active prospects is an A"). Julian tunes these per type in Settings.
export const BUILT_IN_PILLAR_THRESHOLDS: PillarThresholds = {
  interest: { a: 4, b: 3, c: 2, d: 1 },
};

// ---------------------------------------------------------------------------
// Numeric pillar grading.
// ---------------------------------------------------------------------------

// Band a numeric value to an A–F letter against descending floors. A null/
// non-finite value grades to F (the worst letter) — a zero-volume funnel is the
// weakest signal, never a free pass.
export function gradeNumericPillar(
  value: number | null,
  bands: PillarBands
): HealthLetter {
  if (value === null || !Number.isFinite(value)) return "F";
  if (value >= bands.a) return "A";
  if (value >= bands.b) return "B";
  if (value >= bands.c) return "C";
  if (value >= bands.d) return "D";
  return "F";
}

// ---------------------------------------------------------------------------
// Health pillar roll-up (Ministry-Year grades → one letter).
// ---------------------------------------------------------------------------

// Numeric weight of each A–F letter for averaging: A=4 … F=0 (the classic GPA
// scale). The roll-up averages these and bands the mean back to a letter.
const LETTER_POINTS: Record<HealthLetter, number> = {
  A: 4,
  B: 3,
  C: 2,
  D: 1,
  F: 0,
};

// Round a GPA-style mean (0–4) back to an A–F letter. Half-up at each boundary
// (≥3.5 ⇒ A, ≥2.5 ⇒ B, …) so a body of grades lands on the nearest letter.
function letterForMeanPoints(mean: number): HealthLetter {
  if (mean >= 3.5) return "A";
  if (mean >= 2.5) return "B";
  if (mean >= 1.5) return "C";
  if (mean >= 0.5) return "D";
  return "F";
}

// Roll a body of A–F grades up to a single letter by averaging their points and
// banding the mean. Returns null when there are no grades — the board renders
// that as "—" (the health pillars are blank until grades exist). Non-letter
// entries are ignored defensively; an all-ignored array is treated as empty.
export function rollUpGrades(grades: HealthLetter[]): HealthLetter | null {
  const valid = grades.filter((g) => HEALTH_GRADE_LADDER.includes(g));
  if (valid.length === 0) return null;
  const total = valid.reduce((sum, g) => sum + LETTER_POINTS[g], 0);
  return letterForMeanPoints(total / valid.length);
}

// ---------------------------------------------------------------------------
// computePillars — the A–F pillar resolver for one type.
// ---------------------------------------------------------------------------

// Grade the A–F pillars for one group type. Interest comes from the funnel volume
// + thresholds; the two health pillars from the supplied grades, restricted to the
// Ministry Year, null when empty. Capacity is NOT graded here — it is the derived
// per-cell issue (lib/admin/cell-capacity.ts).
//
// `ministryYear` is accepted to keep the signature aligned with the issue's
// contract and to document that the supplied grade arrays are the Ministry-Year
// window for that type — the caller filters grades to the year before passing
// them, so this resolver stays pure and DB-agnostic. It is otherwise unused by
// the math (the roll-up grades whatever year-scoped grades it is handed).
export function computePillars(
  inputs: PillarInputs,
  thresholds: PillarThresholds = BUILT_IN_PILLAR_THRESHOLDS,
  ministryYear?: number | null
): PillarGrades {
  // `ministryYear` is part of the documented contract (the supplied grade arrays
  // are this year's window) but the roll-up grades whatever year-scoped grades it
  // is handed, so the math does not branch on it. Referenced to keep it a real
  // parameter without an unused-var lint exception.
  void ministryYear;
  return {
    interest: gradeNumericPillar(inputs.funnelVolume, thresholds.interest),
    groupHealth: rollUpGrades(inputs.groupGrades),
    leaderHealth: rollUpGrades(inputs.leaderGrades),
  };
}

// ---------------------------------------------------------------------------
// Trigger rubric: thresholds the pillars must clear for the multiply signal.
// ---------------------------------------------------------------------------

// A per-pillar condition the trigger fires on. Health (and interest) are NOT
// monotonic: high health can warrant multiplying OR holding, and low health can
// warrant splitting OR staying put. So each pillar's condition names a DIRECTION,
// not just a minimum:
//   * atLeast — clears when the grade is at least that good (the legacy "min").
//   * atMost  — clears when the grade is at most that good (fires on LOW).
//   * between — clears when the grade falls within a band [best, worst].
export type PillarCondition =
  | { op: "atLeast"; letter: HealthLetter }
  | { op: "atMost"; letter: HealthLetter }
  | { op: "between"; best: HealthLetter; worst: HealthLetter };

// A trigger names, per pillar, the CONDITION that clears it. Omit a pillar to
// exclude it from the trigger. `requireHealthGrades` makes the two health pillars
// (which can be "—") mandatory: when true, a null health pillar fails the
// trigger; when false, an ungraded health pillar is skipped (not yet a blocker)
// so a type isn't held back purely for lack of grades.
export type TriggerRubric = {
  conditions: Partial<Record<PillarKey, PillarCondition>>;
  requireHealthGrades?: boolean;
};

// The per-pillar outcome the trigger evaluated, so the UI can show WHY a type is
// or isn't ready (which pillars cleared, which fell short, which were skipped).
export type PillarTriggerOutcome = {
  pillar: PillarKey;
  // The pillar's graded letter, or null when ungraded ("—").
  letter: HealthLetter | null;
  // The trigger's condition for this pillar.
  condition: PillarCondition;
  // "cleared" | "failed" | "skipped" (ungraded health pillar, not required).
  status: "cleared" | "failed" | "skipped";
};

export type MultiplySignal = {
  // The headline: is this type ready to multiply? True only when every required
  // pillar cleared its minimum.
  ready: boolean;
  // Per-pillar detail for the "why" breakdown. Pillars absent from the trigger
  // are omitted entirely.
  outcomes: PillarTriggerOutcome[];
  // The pillars that fell short (failed), for a quick blocker summary.
  blockers: PillarKey[];
};

// Whether `actual` satisfies a pillar `condition` on the A–F ladder. The ladder
// is best→worst, so a SMALLER index is a better grade:
//   * atLeast — at least as good ⇒ index ≤ the letter's index.
//   * atMost  — at most as good (fires on low) ⇒ index ≥ the letter's index.
//   * between — within [best, worst] inclusive ⇒ index(best) ≤ index ≤ index(worst).
function conditionClears(
  actual: HealthLetter,
  condition: PillarCondition
): boolean {
  const idx = HEALTH_GRADE_LADDER.indexOf(actual);
  switch (condition.op) {
    case "atLeast":
      return idx <= HEALTH_GRADE_LADDER.indexOf(condition.letter);
    case "atMost":
      return idx >= HEALTH_GRADE_LADDER.indexOf(condition.letter);
    case "between": {
      // Tolerate a band whose letters are supplied in either order.
      const lo = Math.min(
        HEALTH_GRADE_LADDER.indexOf(condition.best),
        HEALTH_GRADE_LADDER.indexOf(condition.worst)
      );
      const hi = Math.max(
        HEALTH_GRADE_LADDER.indexOf(condition.best),
        HEALTH_GRADE_LADDER.indexOf(condition.worst)
      );
      return idx >= lo && idx <= hi;
    }
  }
}

// Whether a pillar is one of the two health pillars (which may be null/"—").
function isHealthPillar(pillar: PillarKey): boolean {
  return pillar === "groupHealth" || pillar === "leaderHealth";
}

// Evaluate the trigger over a type's pillar grades. Ready iff every required
// pillar clears its minimum. A null (ungraded) health pillar fails when
// `requireHealthGrades` is set, otherwise it is skipped (counts as neither a
// clear nor a blocker) — so a fresh ministry with no grades isn't permanently
// blocked, but Julian can demand grades before declaring a type ready. There is
// NO blended overall letter: this is the only roll-up of the pillars.
export function evaluateTrigger(
  trigger: TriggerRubric,
  pillars: PillarGrades
): MultiplySignal {
  const outcomes: PillarTriggerOutcome[] = [];
  const blockers: PillarKey[] = [];
  let ready = true;

  const requireHealth = trigger.requireHealthGrades ?? false;

  for (const key of Object.keys(trigger.conditions) as PillarKey[]) {
    const condition = trigger.conditions[key];
    if (condition === undefined) continue;
    const letter = pillars[key];

    if (letter === null) {
      // Only the two health pillars can be null. Treat per requireHealthGrades.
      if (isHealthPillar(key) && !requireHealth) {
        outcomes.push({ pillar: key, letter, condition, status: "skipped" });
        continue;
      }
      outcomes.push({ pillar: key, letter, condition, status: "failed" });
      blockers.push(key);
      ready = false;
      continue;
    }

    if (conditionClears(letter, condition)) {
      outcomes.push({ pillar: key, letter, condition, status: "cleared" });
    } else {
      outcomes.push({ pillar: key, letter, condition, status: "failed" });
      blockers.push(key);
      ready = false;
    }
  }

  return { ready, outcomes, blockers };
}

// ---------------------------------------------------------------------------
// Trust-boundary decoders: raw jsonb (read as `unknown`) → typed config.
// ---------------------------------------------------------------------------
// Each decoder shapes a stored jsonb payload into the clean type, falling back
// to the built-in default for any malformed field rather than throwing — a
// partially-corrupt row still renders sane pillars. The single decode shared by
// the Settings read and the board read.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeBands(raw: unknown, fallback: PillarBands): PillarBands {
  if (!isRecord(raw)) return fallback;
  const num = (v: unknown, dflt: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : dflt;
  return {
    a: num(raw.a, fallback.a),
    b: num(raw.b, fallback.b),
    c: num(raw.c, fallback.c),
    d: num(raw.d, fallback.d),
  };
}

// Decode the stored `thresholds` jsonb into PillarThresholds, defaulting each
// missing band set to the built-in. Any stored `capacity`/`overflow` band keys
// are no longer read (#401): capacity is a derived issue, overflow was retired.
export function decodePillarThresholds(raw: unknown): PillarThresholds {
  if (!isRecord(raw)) return BUILT_IN_PILLAR_THRESHOLDS;
  return {
    interest: decodeBands(raw.interest, BUILT_IN_PILLAR_THRESHOLDS.interest),
  };
}

const PILLAR_KEYS: PillarKey[] = ["interest", "groupHealth", "leaderHealth"];

function isLetter(value: unknown): value is HealthLetter {
  return (
    typeof value === "string" &&
    HEALTH_GRADE_LADDER.includes(value as HealthLetter)
  );
}

// Decode one stored pillar condition. The current shape is a tagged object
// ({op, letter} / {op, best, worst}); a bare letter string is read as the legacy
// "atLeast" minimum. Returns undefined when nothing valid is present.
function decodeCondition(raw: unknown): PillarCondition | undefined {
  if (isLetter(raw)) return { op: "atLeast", letter: raw };
  if (!isRecord(raw)) return undefined;
  if (raw.op === "atMost" && isLetter(raw.letter)) {
    return { op: "atMost", letter: raw.letter };
  }
  if (raw.op === "between" && isLetter(raw.best) && isLetter(raw.worst)) {
    return { op: "between", best: raw.best, worst: raw.worst };
  }
  // Default / explicit "atLeast": accept a letter under either `letter` or the
  // legacy bare value already handled above.
  if (isLetter(raw.letter)) return { op: "atLeast", letter: raw.letter };
  return undefined;
}

// Decode the stored `trigger_rubric` jsonb into a TriggerRubric. Reads the
// current `conditions` map; falls back to the legacy `minimums` map (each lifted
// to an "atLeast" condition) so pre-existing config rows keep working with no
// backfill. Only known pillars with a valid condition survive — any stored
// `capacity`/`overflow` condition is silently dropped (#401: those are no longer
// trigger pillars).
export function decodeTriggerRubric(raw: unknown): TriggerRubric {
  const conditions: Partial<Record<PillarKey, PillarCondition>> = {};
  const source =
    isRecord(raw) && isRecord(raw.conditions)
      ? raw.conditions
      : isRecord(raw) && isRecord(raw.minimums)
        ? raw.minimums
        : null;
  if (source) {
    for (const key of PILLAR_KEYS) {
      const condition = decodeCondition(source[key]);
      if (condition) conditions[key] = condition;
    }
  }
  const requireHealthGrades =
    isRecord(raw) && typeof raw.requireHealthGrades === "boolean"
      ? raw.requireHealthGrades
      : false;
  return { conditions, requireHealthGrades };
}
