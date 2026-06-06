import type { GroupAudienceCategory } from "@/types/enums";
import { wrapError, type ReadClient, type ReadResult } from "./read-core";

// Group Category catalog + cell-matrix read models (#396 / ADR 0015). Two
// column-allowlisted reads feed the Settings > Groups tab — never select("*"),
// even though RLS already restricts SELECT to admins (belt-and-braces, matching
// the multiplication-config + health-rubric reads idiom):
//   1. fetchGroupCategories — the live (non-archived) catalog, alphabetical.
//   2. fetchCategoryTypeCells — every cell row (audience_category × category)
//      with its active flag, so the matrix can render which cells are active.
// The matrix assembly (rows = categories, columns = the three top types) is a
// pure function over these two reads (lib/admin/group-category-matrix.ts).

export const GROUP_CATEGORY_COLUMNS = "id, label, created_at";

// One live catalog category, as read through the allowlist.
export type GroupCategoryRow = {
  id: string;
  label: string;
  created_at: string;
};

// Fetch the live (non-archived) catalog, ordered by label. An empty result is
// the success-with-empty case — a fresh ministry ships an EMPTY catalog (PRD
// §2.2), so the editor seeds a blank row.
export async function fetchGroupCategories(
  client: ReadClient
): Promise<ReadResult<GroupCategoryRow[]>> {
  const { data, error } = await client
    .from("group_categories")
    .select(GROUP_CATEGORY_COLUMNS)
    .is("archived_at", null)
    .order("label", { ascending: true })
    .returns<GroupCategoryRow[]>();

  if (error) return { data: null, error: wrapError("group_categories", error) };
  return { data: data ?? [], error: null };
}

export const CATEGORY_TYPE_CELL_COLUMNS =
  "id, audience_category, category_id, active";

// One cell row, as read through the allowlist. target_count + trigger_overrides
// are deliberately NOT read here — they are later-slice columns.
export type CategoryTypeCellRow = {
  id: string;
  audience_category: GroupAudienceCategory;
  category_id: string;
  active: boolean;
};

// Fetch every cell row. The matrix builder pairs these against the catalog; a
// cell whose category is archived is dropped by the join (the catalog read only
// returns live categories), so an archived category's stale cells never show.
export async function fetchCategoryTypeCells(
  client: ReadClient
): Promise<ReadResult<CategoryTypeCellRow[]>> {
  const { data, error } = await client
    .from("category_type_targets")
    .select(CATEGORY_TYPE_CELL_COLUMNS)
    .returns<CategoryTypeCellRow[]>();

  if (error)
    return { data: null, error: wrapError("category_type_targets", error) };
  return { data: data ?? [], error: null };
}

// #398: the category-picker options for a group of a given top type. A category
// is offered for an audience_category only when it has an ACTIVE cell under that
// top type (the cell is what "applies" the category to the type, wave-1). Live
// (non-archived) categories only — an archived category's cells must never be
// offerable. Returns {id, label}, alphabetical, so the group create/edit form's
// picker is filtered to exactly the categories applied to that group's type.
//
// Two allowlisted reads (never select("*")): the active cells for the type, then
// the live catalog rows for those category ids. Pairing them in TS keeps each
// read column-pinned and drops any cell whose category is archived/absent.
export async function fetchCategoriesForAudience(
  client: ReadClient,
  audienceCategory: GroupAudienceCategory
): Promise<ReadResult<GroupCategoryRow[]>> {
  const cellsRes = await client
    .from("category_type_targets")
    .select(CATEGORY_TYPE_CELL_COLUMNS)
    .eq("audience_category", audienceCategory)
    .eq("active", true)
    .returns<CategoryTypeCellRow[]>();
  if (cellsRes.error)
    return {
      data: null,
      error: wrapError("fetchCategoriesForAudience/cells", cellsRes.error),
    };

  const activeCategoryIds = [
    ...new Set((cellsRes.data ?? []).map((c) => c.category_id)),
  ];
  if (activeCategoryIds.length === 0) return { data: [], error: null };

  const catalogRes = await client
    .from("group_categories")
    .select(GROUP_CATEGORY_COLUMNS)
    .is("archived_at", null)
    .in("id", activeCategoryIds)
    .order("label", { ascending: true })
    .returns<GroupCategoryRow[]>();
  if (catalogRes.error)
    return {
      data: null,
      error: wrapError("fetchCategoriesForAudience/catalog", catalogRes.error),
    };
  return { data: catalogRes.data ?? [], error: null };
}
