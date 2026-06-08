import type { GroupAudienceCategory } from "@/types/enums";
import { AUDIENCE_CATEGORIES } from "@/lib/admin/audience";
import { ministryYearOf } from "@/lib/admin/ministry-year";
import type { MultiplyTabKey } from "@/components/admin/multiply/multiply-shell";

// Shared Multiply constants (#380 → #403). The three top types (the canonical
// Audience vocabulary) and their possessive per-type labels, plus the
// off-season-aware ministry-year helper. These outlived the original per-type
// boards: the boards folded into the per-cell grid (#403, see multiply-grid-data.ts),
// but Settings (the per-type multiplication-config editor and the readiness-rule
// editor) and other surfaces still read them, so they keep their home here.

export const MULTIPLY_TYPES = AUDIENCE_CATEGORIES;

// Possessive labels specific to the Multiply per-type editor — deliberately
// different copy from the canonical AUDIENCE_LABEL, so kept local.
export const MULTIPLY_TYPE_LABEL: Record<GroupAudienceCategory, string> = {
  men: "Men's",
  women: "Women's",
  mixed: "Mixed",
};

// The current ministry year for the Multiply surface. In the Jun/Jul off-season
// there is no active ministry year; the surface then plans for the year whose
// August is next (the current calendar year), so it is never blank in summer.
export function currentMinistryYear(now: Date): number {
  const located = ministryYearOf(now);
  return located.year ?? now.getUTCFullYear();
}

const MULTIPLY_TAB_KEYS: readonly MultiplyTabKey[] = [
  "plan",
  "readiness",
  "leaders",
];

// Resolve the Multiply tab the page should open on from a `?tab=` query param.
// Defaults to "plan" (Julian's working view) for an absent or unrecognized
// value, so a Readiness-grid cell can deep-link with `?tab=plan` and any other
// caller still lands somewhere coherent. Pure, so the server page can call it.
export function resolveMultiplyInitialTab(
  param: string | string[] | undefined
): MultiplyTabKey {
  const raw = Array.isArray(param) ? param[0] : param;
  return MULTIPLY_TAB_KEYS.find((k) => k === raw) ?? "plan";
}
