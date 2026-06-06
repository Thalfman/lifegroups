import type { GroupAudienceCategory } from "@/types/enums";

// #398: the category-picker options the group create/edit form renders, grouped
// by top type. A category is offerable for an audience_category only when it has
// an ACTIVE cell under that top type (wave-1's category_type_targets), so the
// picker shows exactly the categories applied to the group's selected type. The
// list is built server-side (lib/supabase/group-categories-reads
// fetchCategoriesForAudience per type) and handed to the form, which filters by
// the live audience selection client-side.
export type CategoryOption = { id: string; label: string };

export type CategoriesByAudience = Record<
  GroupAudienceCategory,
  CategoryOption[]
>;

export const EMPTY_CATEGORIES_BY_AUDIENCE: CategoriesByAudience = {
  men: [],
  women: [],
  mixed: [],
};

// The options to offer for a (possibly unset) audience selection. An unset
// audience has no cell, so there are no applicable categories — the picker then
// only offers "Uncategorized".
export function optionsForAudience(
  byAudience: CategoriesByAudience,
  audience: GroupAudienceCategory | "" | null | undefined
): CategoryOption[] {
  if (!audience) return [];
  return byAudience[audience] ?? [];
}
