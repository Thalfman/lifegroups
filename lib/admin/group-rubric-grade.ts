// Group-Health Grade by rubric (#377 / ADR 0018, Pivot slice 4). A small deep
// module that produces the ONE grade a grader sees when they score a group
// against the configured Health Rubric, keyed to the current Ministry Year.
//
// It composes — never re-implements — the two existing pure modules:
//   • computeGrade (lib/admin/health-rubric.ts) — the weighted criterion roll-up
//     to a fluid A–F band, renormalizing over the criteria actually scored.
//   • resolveGrade (lib/admin/group-health-override.ts) — the this-month /
//     until-cleared override precedence over that computed letter.
// The math lives in those two; this module owns only the *ordering* (compute the
// rubric letter first, then apply the override) and the ministry-year keying, so
// a caller learns one function instead of re-assembling the pair (and the
// ministry-year lookup) at each call site. Pure: no DB, no I/O.

import type { GroupHealthLetter } from "@/types/enums";
import {
  computeGrade,
  type Rubric,
  type RubricBands,
  type RubricScores,
  BUILT_IN_RUBRIC_BANDS,
} from "@/lib/admin/health-rubric";
import {
  resolveGrade,
  type GradeOverrideScope,
} from "@/lib/admin/group-health-override";
import { ministryYearOf } from "@/lib/admin/ministry-year";

// A manual override of the letter under one of the existing scopes. The
// period_month it was set for is consulted only for "this_month" expiry; an
// "until_cleared" override ignores it (resolveGrade owns that rule).
export type GroupRubricOverride = {
  letter: GroupHealthLetter;
  scope: GradeOverrideScope;
  // The first-of-month (yyyy-mm-dd) the override was SET for. Consulted only for
  // "this_month" expiry. Optional: a freshly-set override (the live preview /
  // the write action) is being set for the current period, so it defaults to the
  // resolution `periodMonth`; the read path passes the STORED month so an
  // expired this-month override correctly falls back to the computed letter.
  period_month?: string;
};

// Everything needed to resolve a group's rubric grade for a period.
export type GroupRubricGradeInput = {
  // The decoded Health Rubric (criteria with weights). Pass through
  // decodeRubricCriteria from the stored jsonb before calling.
  rubric: Rubric;
  // Per-criterion 0–100 scores keyed by criterion key. A criterion with no
  // score is omitted; computeGrade renormalizes over what's present.
  scores: RubricScores;
  // The manual override, or null when the grade is the computed letter.
  override?: GroupRubricOverride | null;
  // First-of-month ISO (yyyy-mm-dd) the grade is being resolved FOR — the
  // override's this-month expiry pivots on this, and its month locates the
  // ministry year.
  periodMonth: string;
  // Score bands (defaults to the built-in 90/80/70/60 ladder).
  bands?: RubricBands;
};

export type GroupRubricGrade = {
  // The weighted 0–100 numeric over the scored criteria, or null when nothing
  // is scored. Reported so an override never silently hides the rubric signal.
  numeric: number | null;
  // The letter the rubric computed (pre-override), or null when nothing scored.
  computed_letter: GroupHealthLetter | null;
  // The letter the surface shows + the Multiplication pillar rolls up: the
  // override's letter when an active override is supplied, else the computed.
  effective_letter: GroupHealthLetter | null;
  // True when an active override forced the effective letter.
  overridden: boolean;
  // The override scope in effect, or null when no active override.
  override_scope: GradeOverrideScope | null;
  // The Ministry Year this grade is keyed to, derived from periodMonth's month.
  // null only when periodMonth lands in the Jun/Jul off-season (no ministry year).
  ministry_year: number | null;
};

// Resolve a group's Group-Health Grade for a period: roll the criterion scores
// up to a fluid A–F via the rubric engine, then apply any active override under
// its scope, and key the result to the period's Ministry Year.
export function resolveGroupRubricGrade(
  input: GroupRubricGradeInput
): GroupRubricGrade {
  const {
    rubric,
    scores,
    override = null,
    periodMonth,
    bands = BUILT_IN_RUBRIC_BANDS,
  } = input;

  // Step 1 — the rubric roll-up. We pass NO override into computeGrade and let
  // resolveGrade own the scope-aware precedence below, so the this-month /
  // until-cleared expiry is decided in exactly one place.
  const computed = computeGrade(rubric, scores, undefined, bands);

  // Step 2 — scope-aware override precedence over the computed letter.
  const resolved = resolveGrade(
    computed.letter,
    override === null
      ? null
      : {
          letter: override.letter,
          scope: override.scope,
          period_month: override.period_month ?? periodMonth,
        },
    periodMonth
  );

  // Step 3 — key it to the Ministry Year the period falls in (Aug–May).
  const ministryYear = ministryYearOf(
    new Date(`${periodMonth}T00:00:00.000Z`)
  ).year;

  return {
    numeric: computed.numeric,
    computed_letter: resolved.computed_letter,
    effective_letter: resolved.effective_letter,
    overridden: resolved.is_overridden,
    override_scope: resolved.override_scope,
    ministry_year: ministryYear,
  };
}
