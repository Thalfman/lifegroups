import type {
  GroupAudienceCategory,
  GroupLifecycleStatus,
} from "@/types/enums";
import { wrapError, type ReadClient, type ReadResult } from "./read-core";
import { AUDIENCE_CATEGORIES, isAudienceCategory } from "@/lib/admin/audience";

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

// ---------------------------------------------------------------------------
// Per-cell target_count + coverage reads (#400 / PRD §2.3).
// ---------------------------------------------------------------------------
//
// The cell coverage surface ("have X of Y") needs two new allowlisted reads,
// kept separate from fetchCategoryTypeCells so its existing callers (the matrix
// builder, which has no need for target_count) keep their pinned column set:
//   1. fetchCategoryTypeTargetCells — every cell row WITH its target_count, so
//      the coverage builder reads Y per cell.
//   2. fetchGroupCellLifecycleRows — every non-closed group with a category, as
//      {audience_category, category_id, lifecycle_status}, so the coverage
//      builder counts X (active + launching) per cell. Member counts are NOT
//      needed for #400, so they are deliberately not read here.

export const CATEGORY_TYPE_TARGET_COLUMNS =
  "id, audience_category, category_id, active, target_count, trigger_overrides";

// One cell row with its target_count AND trigger_overrides, as read through the
// allowlist. Carries the target (Y) the coverage readout reads against (#400) and
// the per-cell readiness overrides (#402) — a partial of the global rule, decoded
// at the trust boundary (lib/admin/cell-readiness.ts decodeCellOverride); the raw
// jsonb stays unknown here. The coverage builder simply ignores trigger_overrides.
export type CategoryTypeTargetRow = {
  id: string;
  audience_category: GroupAudienceCategory;
  category_id: string;
  active: boolean;
  target_count: number;
  trigger_overrides: unknown;
};

// Fetch every cell row with its target_count. The coverage builder keeps only the
// ACTIVE cells (a cell is active when active=true) and pairs them against the
// group lifecycle rows below.
export async function fetchCategoryTypeTargetCells(
  client: ReadClient
): Promise<ReadResult<CategoryTypeTargetRow[]>> {
  const { data, error } = await client
    .from("category_type_targets")
    .select(CATEGORY_TYPE_TARGET_COLUMNS)
    .returns<CategoryTypeTargetRow[]>();

  if (error)
    return {
      data: null,
      error: wrapError("category_type_targets/targets", error),
    };
  return { data: data ?? [], error: null };
}

export const GROUP_CELL_LIFECYCLE_COLUMNS =
  "audience_category, category_id, lifecycle_status";

// One group's cell membership + lifecycle, as read through the allowlist — the
// fact the coverage count (X) needs. A NULL category_id (Uncategorized) is filtered
// out in SQL: such a group is in no category cell (PRD §2.3). A closed group is
// likewise filtered in SQL — only non-closed groups can count toward coverage.
export type GroupCellLifecycleRow = {
  audience_category: GroupAudienceCategory | null;
  category_id: string;
  lifecycle_status: GroupLifecycleStatus;
};

// Fetch every non-closed group that carries a category, as its cell + lifecycle.
// The active+launching rule (which lifecycle states count toward X) is applied
// purely in lib/admin/cell-coverage.ts, so it stays unit-testable without a DB.
export async function fetchGroupCellLifecycleRows(
  client: ReadClient
): Promise<ReadResult<GroupCellLifecycleRow[]>> {
  const { data, error } = await client
    .from("groups")
    .select(GROUP_CELL_LIFECYCLE_COLUMNS)
    .not("category_id", "is", null)
    .neq("lifecycle_status", "closed")
    .returns<GroupCellLifecycleRow[]>();

  if (error)
    return { data: null, error: wrapError("groups/cell-lifecycle", error) };
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

// ---------------------------------------------------------------------------
// Active-cell category options for a top type (#399).
// ---------------------------------------------------------------------------
//
// The prospect-intake form's category select offers, for the chosen top type,
// only the categories that have an ACTIVE cell in category_type_targets for that
// audience_category — i.e. the live cells of the matrix. The read joins each
// active cell to its (live) catalog category, allowlisted to the option's
// id/label, ordered by label for a stable picker. An archived category's cell is
// dropped because the inner-joined catalog row is excluded by archived_at.

// One category option for a top type's intake picker.
export type CategoryOption = {
  id: string;
  label: string;
};

// The raw join row: an active cell + its (possibly-archived) catalog category.
type ActiveCellCategoryJoinRow = {
  category_id: string;
  category: { label: string; archived_at: string | null } | null;
};

const ACTIVE_CELL_CATEGORY_COLUMNS =
  "category_id, category:group_categories(label, archived_at)";

// Fetch the categories with an ACTIVE cell for a top type, as intake options.
// Archived categories are dropped (their catalog row carries archived_at), so a
// stale active cell whose category was later archived never appears. Returns the
// options sorted by label.
export async function fetchActiveCategoriesForAudience(
  client: ReadClient,
  audienceCategory: GroupAudienceCategory
): Promise<ReadResult<CategoryOption[]>> {
  const { data, error } = await client
    .from("category_type_targets")
    .select(ACTIVE_CELL_CATEGORY_COLUMNS)
    .eq("audience_category", audienceCategory)
    .eq("active", true)
    .returns<ActiveCellCategoryJoinRow[]>();

  if (error)
    return {
      data: null,
      error: wrapError("fetchActiveCategoriesForAudience", error),
    };

  const options: CategoryOption[] = (data ?? [])
    .filter(
      (
        row
      ): row is ActiveCellCategoryJoinRow & {
        category: { label: string; archived_at: string | null };
      } => row.category != null && row.category.archived_at == null
    )
    .map((row) => ({ id: row.category_id, label: row.category.label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { data: options, error: null };
}

// All three top types' active-cell category options, in one shape the intake form
// can hand to its dependent select. Each top type maps to its sorted options;
// a top type with no active cells maps to an empty array.
export type CategoryOptionsByAudience = Record<
  GroupAudienceCategory,
  CategoryOption[]
>;

export const EMPTY_CATEGORY_OPTIONS_BY_AUDIENCE: CategoryOptionsByAudience = {
  men: [],
  women: [],
  mixed: [],
};

// Pure assembly (exported for testing): bucket active-cell category options by
// their top type from the full cell+category join, dropping archived categories
// and de-duplicating a category that somehow has two active cells for one type
// (the unique (audience_category, category_id) cell makes that impossible in the
// DB, but the bucketer stays defensive). Options come out sorted by label.
export function bucketActiveCategoryOptions(
  rows: Array<{
    audience_category: GroupAudienceCategory;
    category_id: string;
    active: boolean;
    category: { label: string; archived_at: string | null } | null;
  }>
): CategoryOptionsByAudience {
  const out: CategoryOptionsByAudience = {
    men: [],
    women: [],
    mixed: [],
  };
  const seen: Record<GroupAudienceCategory, Set<string>> = {
    men: new Set(),
    women: new Set(),
    mixed: new Set(),
  };
  for (const row of rows) {
    if (!row.active) continue;
    if (row.category == null || row.category.archived_at != null) continue;
    const type = row.audience_category;
    if (!isAudienceCategory(type)) continue;
    if (seen[type].has(row.category_id)) continue;
    seen[type].add(row.category_id);
    out[type].push({ id: row.category_id, label: row.category.label });
  }
  for (const type of AUDIENCE_CATEGORIES) {
    out[type].sort((a, b) => a.label.localeCompare(b.label));
  }
  return out;
}

const ACTIVE_CELL_WITH_AUDIENCE_COLUMNS =
  "audience_category, category_id, active, category:group_categories(label, archived_at)";

type ActiveCellWithAudienceJoinRow = {
  audience_category: GroupAudienceCategory;
  category_id: string;
  active: boolean;
  category: { label: string; archived_at: string | null } | null;
};

// Fetch all three top types' active-cell category options in one round-trip, for
// the intake form's dependent category select. The bucketing is pure/tested.
export async function fetchActiveCategoryOptionsByAudience(
  client: ReadClient
): Promise<ReadResult<CategoryOptionsByAudience>> {
  const { data, error } = await client
    .from("category_type_targets")
    .select(ACTIVE_CELL_WITH_AUDIENCE_COLUMNS)
    .eq("active", true)
    .returns<ActiveCellWithAudienceJoinRow[]>();

  if (error)
    return {
      data: null,
      error: wrapError("fetchActiveCategoryOptionsByAudience", error),
    };

  return { data: bucketActiveCategoryOptions(data ?? []), error: null };
}
