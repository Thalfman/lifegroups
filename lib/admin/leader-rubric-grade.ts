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
// Pure: no DB, no I/O. It is a thin named facade over the shared grade-resolution
// core (lib/admin/rubric-grade-core.ts) — no second engine, no new math. The core
// owns the ordering (compute the rubric letter, then apply any active override,
// then key the Ministry Year); this facade owns only the Leader-Health letter
// typing and the echoed-back ministry year, so the Leader-Health Grade and the
// symmetric Group-Health Grade resolve a (scores, override, period) input
// identically while reading distinctly at the call site.

import type { LeaderHealthLetter } from "@/types/enums";
import type { Rubric, RubricScores } from "@/lib/admin/health-rubric";
import type {
  GradeOverride,
  ResolvedGrade,
} from "@/lib/admin/group-health-override";
import { resolveRubricGrade } from "@/lib/admin/rubric-grade-core";

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

  // The shared core owns the roll-up + scope-aware override precedence (a
  // "this_month" override that has expired falls back to the computed letter).
  // The Leader-Health Grade keys on the ministryYear the caller already resolved,
  // so we echo it back rather than re-deriving it from the period month.
  const resolved = resolveRubricGrade({
    rubric,
    scores,
    override,
    periodMonth: currentPeriodMonth,
  });

  return {
    numeric: resolved.numeric,
    letter: resolved.effective_letter,
    computed_letter: resolved.computed_letter,
    overridden: resolved.overridden,
    override_scope: resolved.override_scope,
    ministry_year: ministryYear,
  };
}
