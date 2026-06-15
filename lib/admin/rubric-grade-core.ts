// Private grade-resolution core (issue #636, slice 2). The one place that
// composes the three existing pure pieces into a resolved A–F grade:
//   • computeGrade (lib/admin/health-rubric.ts) — the weighted criterion roll-up
//     to a fluid A–F band, renormalizing over the criteria actually scored.
//   • resolveGrade (lib/admin/group-health-override.ts) — the this-month /
//     until-cleared override precedence over that computed letter.
//   • ministryYearOf (lib/admin/ministry-year.ts) — the Ministry-Year keying.
//
// The Group-Health Grade and the Leader-Health Grade are deliberately distinct
// concepts (CONTEXT.md), so each keeps its own named facade
// (resolveGroupRubricGrade / resolveLeaderGrade). Both are thin wrappers over
// this core, so the ordering (compute the rubric letter, then apply the override,
// then key the Ministry Year) lives once and the two grades can never resolve a
// (scores, override, period) input differently. Pure: no DB, no I/O. Not exported
// past the two facades — callers consume a facade, never this core directly.

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
  type GradeOverride,
  type GradeOverrideScope,
} from "@/lib/admin/group-health-override";
import { ministryYearOf } from "@/lib/admin/ministry-year";

// The fully-resolved grade the facades re-expose under their own field names.
// Letters are typed GroupHealthLetter; the Leader facade re-types them to the
// structurally-identical LeaderHealthLetter at its boundary.
export type ResolvedRubricGrade = {
  // Weighted 0–100 numeric over the scored criteria, or null when nothing is
  // scored. Reported so an override never silently hides the rubric signal.
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
  // The Ministry Year the period falls in (Aug–May), or null in the Jun/Jul
  // off-season.
  ministry_year: number | null;
};

// Resolve a rubric grade: roll the criterion scores up to a fluid A–F via the
// engine, apply any active override under its scope, and key the result to the
// period's Ministry Year. `periodMonth` is the first-of-month ISO (yyyy-mm-dd)
// the grade is resolved FOR — the override's this-month expiry pivots on it and
// its month locates the Ministry Year.
export function resolveRubricGrade(input: {
  rubric: Rubric;
  scores: RubricScores;
  override: GradeOverride | null;
  periodMonth: string;
  bands?: RubricBands;
}): ResolvedRubricGrade {
  const {
    rubric,
    scores,
    override,
    periodMonth,
    bands = BUILT_IN_RUBRIC_BANDS,
  } = input;

  // Step 1 — the rubric roll-up. We pass NO override into computeGrade and let
  // resolveGrade own the scope-aware precedence below, so the this-month /
  // until-cleared expiry is decided in exactly one place.
  const computed = computeGrade(rubric, scores, undefined, bands);

  // Step 2 — scope-aware override precedence over the computed letter.
  const resolved = resolveGrade(computed.letter, override, periodMonth);

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
