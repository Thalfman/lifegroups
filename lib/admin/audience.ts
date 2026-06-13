// The Audience vocabulary (CONTEXT.md › Audience): who a Life Group is for, by the
// `audience_category` attribute — Men, Women, or Mixed / couples.
//
// One pure leaf so the ordered set of the three top types, the canonical labels,
// and the type guard have a single home, rather than being re-spelled as
// GRID_TYPES, MATRIX_TYPES, MULTIPLY_TYPES, GROUP_TYPES, DESIRED_AUDIENCE_CATEGORIES,
// and inline `["men","women","mixed"]` arrays across the grid, matrix, multiply,
// reads, and validation modules. No I/O, no surface dependency — which is exactly
// why the grid/matrix copies were "kept local" before: there was no pure home to
// point them at. There is now.

import type { GroupAudienceCategory } from "@/types/enums";
import { cellKey } from "@/lib/admin/cell-coordinate";

// The three top types, in board / display order.
export const AUDIENCE_CATEGORIES: readonly GroupAudienceCategory[] = [
  "men",
  "women",
  "mixed",
];

// The canonical Audience labels (CONTEXT.md wording: "Men, Women, or Mixed /
// couples"). Surfaces that deliberately show different copy — the possessive
// "Men's / Women's" on the prospect form and the per-type Multiply editor — keep
// their own label maps; this is the segmentation/default wording.
export const AUDIENCE_LABEL: Record<GroupAudienceCategory, string> = {
  men: "Men",
  women: "Women",
  mixed: "Mixed / couples",
};

// Narrow an arbitrary value to a GroupAudienceCategory. Replaces the membership
// Sets and the per-file guards that all re-spelled this same check.
export function isAudienceCategory(
  value: unknown
): value is GroupAudienceCategory {
  return value === "men" || value === "women" || value === "mixed";
}

// A "group type" is a cell — an audience × a free-form category. These shapes
// and the key live in this pure leaf (no server/IO deps) so both the server
// data builders and the client planner can share them without a client bundle
// pulling in server-only code.

// A selectable group type for the multiplication candidate form's top picker;
// `label` is the category's catalog label (e.g. "20-30s").
export type GroupTypeOption = {
  audienceCategory: GroupAudienceCategory;
  categoryId: string;
  label: string;
};

// A group that carries a given type, for the "willing to multiply" picker.
export type GroupTypeRef = { id: string; name: string };

// The stable key joining an audience + category into one map key, so the
// server's `groupsByType` and the client's lookups agree without sharing state.
// The canonical Cell coordinate key (cellKey): a "group type" in the planner's
// vocabulary is the same (Audience × category) coordinate a cell is.
export function groupTypeKey(
  audience: GroupAudienceCategory,
  categoryId: string
): string {
  return cellKey({ audience, categoryId });
}
