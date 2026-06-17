// Pure Group-Health Grade override resolution (PRD Q12 / ADR 0004 D8, #129).
// No DB, no I/O — given the computed letter and a manual override, decide the
// grade Julian actually sees, keeping the computed letter visible alongside so
// an override never silently hides what the rubric said ("computed B, set to A").
//
// An override carries a scope chosen at set time:
//   "this_month"    — applies only to the month it was set for, then auto-clears
//                     at the monthly rollover (the default; a one-off judgment
//                     must not quietly persist for a year).
//   "until_cleared" — stands across periods until the admin clears it.

import type { GroupHealthLetter } from "@/types/enums";

export type GradeOverrideScope = "this_month" | "until_cleared";

export type GradeOverride = {
  letter: GroupHealthLetter;
  scope: GradeOverrideScope;
  // The review month the override was set for (yyyy-mm-dd, first of month).
  // Consulted only for "this_month" expiry; "until_cleared" ignores it.
  period_month: string;
};

export type ResolvedGrade = {
  computed_letter: GroupHealthLetter | null;
  effective_letter: GroupHealthLetter | null;
  is_overridden: boolean;
  override_scope: GradeOverrideScope | null;
};

export function resolveGrade(
  computedLetter: GroupHealthLetter | null,
  override: GradeOverride | null,
  currentPeriodMonth: string
): ResolvedGrade {
  // Narrow on `override` directly (not a derived boolean) so the active branch
  // reads its fields without a non-null assertion.
  const activeOverride =
    override !== null && isOverrideActive(override, currentPeriodMonth)
      ? override
      : null;
  return {
    computed_letter: computedLetter,
    effective_letter: activeOverride ? activeOverride.letter : computedLetter,
    is_overridden: activeOverride !== null,
    override_scope: activeOverride ? activeOverride.scope : null,
  };
}

// A "this_month" override is live only for the month it was set for; once the
// period has rolled past it, it's expired. "until_cleared" stays live until the
// admin clears it (no period check).
function isOverrideActive(
  override: GradeOverride,
  currentPeriodMonth: string
): boolean {
  if (override.scope === "until_cleared") return true;
  return override.period_month === currentPeriodMonth;
}
