// Multiplication Pillars — pure resolver (#380 / ADR 0016, 0019). No I/O, no
// Supabase. The Multiply area shows three boards by group type (men / women /
// mixed); each board grades four PILLARS — Capacity, Interest, Group Health,
// Leader Health — to an A–F letter, and a Julian-configured TRIGGER RUBRIC over
// those pillars produces a single "ready to multiply this type" signal. There is
// deliberately NO blended overall letter: the pillars stay separate and the
// trigger is the only roll-up.
//
// The math lives here so every rule is isolation-testable with bare objects:
//   * Capacity is fed by the Ministry Admin per type in Settings (NOT derived
//     from in-app counts) — a fed numeric + thresholds → A–F.
//   * Interest derives from the Interest Funnel VOLUME for that type — a count +
//     thresholds → A–F.
//   * Group Health / Leader Health roll up that type's supplied grades over the
//     Ministry Year, yielding null ("—") until any grade exists. Grade storage
//     lands in parallel slices (#377/#378); this resolver takes the grades as
//     plain A–F arrays so the board ships and shows "—" when none are fed.
//
// A single full group can independently raise a "multiply this one" flag from
// the Capacity input — see flagIndividualGroupMultiply.

import { HEALTH_GRADE_LADDER } from "@/lib/admin/health-rubric";
import type { GroupHealthLetter } from "@/types/enums";

// The A–F letter the pillars grade to. Reuses the health-rubric ladder's letter
// type so the Multiply pillars and the Health rubric share one A–F vocabulary.
export type HealthLetter = GroupHealthLetter;

// The pillar identities. Capacity + Interest are always computable from a fed
// number; the two health pillars roll up supplied grades and may be null.
export type PillarKey =
  | "capacity"
  | "interest"
  | "groupHealth"
  | "leaderHealth";

// The graded board for one group type: each pillar's A–F letter, or null where
// the health pillars have no grades yet (rendered as "—").
export type PillarGrades = {
  capacity: HealthLetter;
  interest: HealthLetter;
  groupHealth: HealthLetter | null;
  leaderHealth: HealthLetter | null;
};

// ---------------------------------------------------------------------------
// Thresholds: the A–F cut-lines for the two numeric pillars (Capacity, Interest).
// ---------------------------------------------------------------------------

// Inclusive lower bounds for each letter, best → worst. A value at or above `a`
// is an A, at or above `b` a B, and so on; anything below `d` is an F. Higher
// inputs are healthier (more room before full / more interest volume), so the
// floors descend A ≥ B ≥ C ≥ D.
export type PillarBands = {
  a: number;
  b: number;
  c: number;
  d: number;
};

// A type's full threshold configuration: one band set per numeric pillar. The
// health pillars are graded from supplied letters, not bands, so they need none.
export type PillarThresholds = {
  capacity: PillarBands;
  interest: PillarBands;
};

// The fed Capacity input for a type. `headroom` is the Ministry-Admin number
// that drives the pillar (e.g. open seats / groups of slack before the type is
// full); `fullGroupCount` lets a single full group raise an individual flag.
export type FedCapacity = {
  // The Ministry-Admin-fed capacity headroom for this type. Graded against the
  // capacity bands. Higher = more room. Null when the admin has not fed a value
  // — then the pillar grades at the floor (F), since no fed room is the worst
  // capacity signal and the type cannot be claimed ready on capacity alone.
  headroom: number | null;
  // How many individual groups of this type are at/over full. A single full
  // group can raise a per-group "multiply this one" flag (acceptance #4),
  // independent of the type-level trigger.
  fullGroupCount: number;
};

// The plain inputs the resolver grades. Grade arrays are A–F letters as the
// parallel grade-storage slices will supply them; empty arrays yield "—".
export type PillarInputs = {
  // The Interest Funnel volume for this type (count of active prospects whose
  // matched/joined group is of this type). Drives the Interest pillar.
  funnelVolume: number;
  // This type's group-health grades within the Ministry Year (A–F). Empty ⇒ "—".
  groupGrades: HealthLetter[];
  // This type's leader-health grades within the Ministry Year (A–F). Empty ⇒ "—".
  leaderGrades: HealthLetter[];
  // The Ministry-Admin-fed capacity for this type.
  fedCapacity: FedCapacity;
};

// Built-in default bands. Capacity/Interest default to a simple 4/3/2/1 ladder
// (e.g. "4+ open seats is an A"); Julian tunes these per type in Settings.
export const BUILT_IN_PILLAR_THRESHOLDS: PillarThresholds = {
  capacity: { a: 4, b: 3, c: 2, d: 1 },
  interest: { a: 4, b: 3, c: 2, d: 1 },
};

// ---------------------------------------------------------------------------
// Numeric pillar grading.
// ---------------------------------------------------------------------------

// Band a numeric value to an A–F letter against descending floors. A null/
// non-finite value grades to F (the worst letter) — an unfed capacity or a
// zero-volume funnel is the weakest signal, never a free pass.
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
// computePillars — the four-pillar resolver for one type.
// ---------------------------------------------------------------------------

// Grade all four pillars for one group type. Capacity comes from the fed input
// + thresholds (never from in-app counts); Interest from the funnel volume +
// thresholds; the two health pillars from the supplied grades, restricted to the
// Ministry Year, null when empty.
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
    capacity: gradeNumericPillar(
      inputs.fedCapacity.headroom,
      thresholds.capacity
    ),
    interest: gradeNumericPillar(inputs.funnelVolume, thresholds.interest),
    groupHealth: rollUpGrades(inputs.groupGrades),
    leaderHealth: rollUpGrades(inputs.leaderGrades),
  };
}

// ---------------------------------------------------------------------------
// Trigger rubric: thresholds the pillars must clear for the multiply signal.
// ---------------------------------------------------------------------------

// A trigger names, per pillar, the WORST letter that still clears it (a "min"
// grade). A pillar clears when its graded letter is at least that good. Omit a
// pillar to exclude it from the trigger. `requireHealthGrades` makes the two
// health pillars (which can be "—") mandatory: when true, a null health pillar
// fails the trigger; when false, an ungraded health pillar is skipped (not yet
// a blocker) so a type isn't held back purely for lack of grades.
export type TriggerRubric = {
  minimums: Partial<Record<PillarKey, HealthLetter>>;
  requireHealthGrades?: boolean;
};

// The per-pillar outcome the trigger evaluated, so the UI can show WHY a type is
// or isn't ready (which pillars cleared, which fell short, which were skipped).
export type PillarTriggerOutcome = {
  pillar: PillarKey;
  // The pillar's graded letter, or null when ungraded ("—").
  letter: HealthLetter | null;
  // The trigger's required minimum for this pillar.
  required: HealthLetter;
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

// True when `actual` is at least as good as `required` on the A–F ladder. The
// ladder is best→worst, so a SMALLER index is a better grade: actual clears when
// its index ≤ the required index.
function letterClears(actual: HealthLetter, required: HealthLetter): boolean {
  return (
    HEALTH_GRADE_LADDER.indexOf(actual) <= HEALTH_GRADE_LADDER.indexOf(required)
  );
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

  for (const key of Object.keys(trigger.minimums) as PillarKey[]) {
    const required = trigger.minimums[key];
    if (required === undefined) continue;
    const letter = pillars[key];

    if (letter === null) {
      // Only the two health pillars can be null. Treat per requireHealthGrades.
      if (isHealthPillar(key) && !requireHealth) {
        outcomes.push({ pillar: key, letter, required, status: "skipped" });
        continue;
      }
      outcomes.push({ pillar: key, letter, required, status: "failed" });
      blockers.push(key);
      ready = false;
      continue;
    }

    if (letterClears(letter, required)) {
      outcomes.push({ pillar: key, letter, required, status: "cleared" });
    } else {
      outcomes.push({ pillar: key, letter, required, status: "failed" });
      blockers.push(key);
      ready = false;
    }
  }

  return { ready, outcomes, blockers };
}

// ---------------------------------------------------------------------------
// Individual-group multiply flag (acceptance #4).
// ---------------------------------------------------------------------------

// A single full group can raise its own "multiply this one" flag from the
// Capacity input, independent of whether the TYPE is ready. The flag fires when
// the fed capacity reports one or more full groups of this type.
export type IndividualMultiplyFlag = {
  flagged: boolean;
  // How many individual groups of the type are at/over full (the source count).
  fullGroupCount: number;
};

// Raise the individual-group flag from a type's fed capacity. Pure: the flag is
// purely a function of the fed full-group count, never of in-app member counts.
export function flagIndividualGroupMultiply(
  fedCapacity: FedCapacity
): IndividualMultiplyFlag {
  const count = Number.isFinite(fedCapacity.fullGroupCount)
    ? Math.max(0, Math.trunc(fedCapacity.fullGroupCount))
    : 0;
  return { flagged: count > 0, fullGroupCount: count };
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
// missing band set to the built-in.
export function decodePillarThresholds(raw: unknown): PillarThresholds {
  if (!isRecord(raw)) return BUILT_IN_PILLAR_THRESHOLDS;
  return {
    capacity: decodeBands(raw.capacity, BUILT_IN_PILLAR_THRESHOLDS.capacity),
    interest: decodeBands(raw.interest, BUILT_IN_PILLAR_THRESHOLDS.interest),
  };
}

const PILLAR_KEYS: PillarKey[] = [
  "capacity",
  "interest",
  "groupHealth",
  "leaderHealth",
];

// Decode the stored `trigger_rubric` jsonb into a TriggerRubric. Only A–F
// minimums on known pillars survive; everything else is dropped.
export function decodeTriggerRubric(raw: unknown): TriggerRubric {
  const minimums: Partial<Record<PillarKey, HealthLetter>> = {};
  if (isRecord(raw) && isRecord(raw.minimums)) {
    for (const key of PILLAR_KEYS) {
      const value = raw.minimums[key];
      if (
        typeof value === "string" &&
        HEALTH_GRADE_LADDER.includes(value as HealthLetter)
      ) {
        minimums[key] = value as HealthLetter;
      }
    }
  }
  const requireHealthGrades =
    isRecord(raw) && typeof raw.requireHealthGrades === "boolean"
      ? raw.requireHealthGrades
      : false;
  return { minimums, requireHealthGrades };
}

// Decode the stored `fed_capacity` jsonb into FedCapacity. A missing/invalid
// headroom decodes to null (ungraded ⇒ F); a missing full-group count to 0.
export function decodeFedCapacity(raw: unknown): FedCapacity {
  if (!isRecord(raw)) return { headroom: null, fullGroupCount: 0 };
  const headroom =
    typeof raw.headroom === "number" && Number.isFinite(raw.headroom)
      ? raw.headroom
      : null;
  const fullGroupCount =
    typeof raw.fullGroupCount === "number" &&
    Number.isFinite(raw.fullGroupCount)
      ? Math.max(0, Math.trunc(raw.fullGroupCount))
      : 0;
  return { headroom, fullGroupCount };
}
