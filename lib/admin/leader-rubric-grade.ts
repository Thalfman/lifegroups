// Leader-Health Grade facade (#378 / ADR 0018, pivot slice 5). The SYMMETRIC
// counterpart to the Group-Health Grade pipeline (lib/admin/group-health-grades.ts):
// given the decoded Leader-Health Rubric, a leader's per-criterion scores, an
// optional manual override, and the ministry-year period, it resolves the one
// Leader-Health Grade the Care surface shows.
//
// This is a deliberate FOURTH "health" concept — kept sharply distinct from the
// Leader Care Status (pastoral signal) and the Health Pulse (self-report). It
// feeds the Multiplication "Leader Health" pillar.
//
// Pure: no DB, no I/O. It REUSES the shared rubric engine (computeGrade) and the
// shared override resolver (resolveGrade) — no second engine, no new math. The
// only thing this module owns is the ordering: compute the rubric letter, then
// apply any active override, so a caller learns one function rather than wiring
// computeGrade + resolveGrade together at every call site.

import type { LeaderHealthLetter } from "@/types/enums";
import {
  computeGrade,
  type Rubric,
  type RubricScores,
} from "@/lib/admin/health-rubric";
import {
  resolveGrade,
  type GradeOverride,
  type ResolvedGrade,
} from "@/lib/admin/group-health-override";

// The override carried into the facade — the same shape the group grade uses
// (letter + scope + the period the override was set for). The override scope
// vocabulary is shared with the group grade (GroupHealthOverrideScope), per
// types/enums.ts, so the two grades resolve overrides identically.
export type LeaderGradeOverride = GradeOverride;

// The resolved Leader-Health Grade. `letter` is the EFFECTIVE letter the Care
// surface shows (the override when active, else the computed band), typed as
// LeaderHealthLetter; `computed_letter` keeps the underlying rubric letter
// visible so an override never silently hides what the rubric said; `overridden`
// lets the surface badge it.
export type ResolvedLeaderGrade = {
  // Weighted 0–100 internal numeric over the scored criteria, or null when no
  // criterion has a score yet.
  numeric: number | null;
  // The effective A–F letter the surface shows and the pillar reads.
  letter: LeaderHealthLetter | null;
  // The rubric-computed letter, kept alongside even when overridden.
  computed_letter: LeaderHealthLetter | null;
  // True when an active override is forcing the letter.
  overridden: boolean;
  // The active override's scope, or null when no override is active.
  override_scope: ResolvedGrade["override_scope"];
  // The ministry year this grade is keyed to (echoed back for the caller).
  ministry_year: number;
};

// Resolve a leader's Leader-Health Grade. Computes the weighted roll-up over the
// (possibly partial) scores via the shared engine, then resolves any override
// against the current period month via the shared resolver. The ministry year is
// the keying dimension — the grade is one row per leader per ministry year — and
// is echoed back so the caller can persist/display it without re-deriving.
//
// `currentPeriodMonth` is the YYYY-MM-DD first-of-month the override expiry is
// judged against (a "this_month" override is live only for the month it was set
// for; "until_cleared" ignores it).
export function resolveLeaderGrade(args: {
  rubric: Rubric;
  scores: RubricScores;
  override: LeaderGradeOverride | null;
  ministryYear: number;
  currentPeriodMonth: string;
}): ResolvedLeaderGrade {
  const { rubric, scores, override, ministryYear, currentPeriodMonth } = args;

  // Engine roll-up. We do NOT pass the override into computeGrade — the override
  // precedence + scope expiry lives in resolveGrade, the single resolver shared
  // with the group grade, so a "this_month" override that has expired correctly
  // falls back to the computed letter (computeGrade has no notion of expiry).
  const computed = computeGrade(rubric, scores);

  const resolved = resolveGrade(computed.letter, override, currentPeriodMonth);

  return {
    numeric: computed.numeric,
    letter: resolved.effective_letter,
    computed_letter: resolved.computed_letter,
    overridden: resolved.is_overridden,
    override_scope: resolved.override_scope,
    ministry_year: ministryYear,
  };
}
