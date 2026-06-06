import type { GroupAudienceCategory } from "@/types/enums";
import { AUDIENCE_CATEGORIES } from "@/lib/admin/audience";
import { ministryYearOf } from "@/lib/admin/ministry-year";

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
