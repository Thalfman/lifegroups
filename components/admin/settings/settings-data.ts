import type { SettingsShellData } from "@/components/admin/settings-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchAllGroupMetricSettings,
  fetchAllGroups,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import {
  BUILT_IN_METRIC_DEFAULTS,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import { fetchHealthRubric } from "@/lib/supabase/health-rubric-reads";
import { decodeRubricCriteria } from "@/lib/admin/health-rubric";
import {
  fetchAudienceReadinessRules,
  fetchReadinessRule,
  type AudienceReadinessRuleRow,
} from "@/lib/supabase/readiness-reads";
import {
  BUILT_IN_READINESS_RULE,
  decodeCellOverride,
  decodePerTypeRule,
  decodeReadinessRule,
  type PerTypeReadinessRule,
  type ReadinessRule,
} from "@/lib/admin/cell-readiness";
import type { ReadinessCellSeed } from "@/components/admin/settings/multiply-trigger-editor";
import { currentMinistryYear } from "@/components/admin/multiply/multiply-data";
import type { GroupAudienceCategory } from "@/types/enums";
import {
  fetchCategoriesForAudience,
  fetchCategoryTypeTargetCells,
  fetchGroupCategories,
  fetchGroupCellLifecycleRows,
  type CategoryTypeTargetRow,
  type GroupCellLifecycleRow,
} from "@/lib/supabase/group-categories-reads";
import {
  EMPTY_CATEGORIES_BY_AUDIENCE,
  type CategoriesByAudience,
} from "@/components/admin/forms/group-category-options";
import {
  buildCellCoverage,
  sortByLargestShortfall,
  type CellCoverage,
} from "@/lib/admin/cell-coverage";

// The Settings surface's data, as a function of the reads seam (ADR 0015). The
// build function takes `isSuperAdmin` only to record it on the shell data (the
// System tab gates bulk people import on it); it crosses no Super-Admin-only
// read here.

export type SettingsReads = {
  fetchMetricDefaults: OmitClient<typeof fetchMetricDefaultsCached>;
  fetchAllGroups: OmitClient<typeof fetchAllGroups>;
  fetchAllGroupMetricSettings: OmitClient<typeof fetchAllGroupMetricSettings>;
  // #374 Health Rubric: the current group rubric (Ministry-Admin-owned). Bound
  // to the "group" kind here so the seam exposes a zero-arg read like the rest.
  fetchGroupHealthRubric: () => ReturnType<typeof fetchHealthRubric>;
  // #402 Settings > Multiply: the GLOBAL readiness rule for the current ministry
  // year. Bound to the year so the seam stays zero-arg; the per-cell overrides come
  // from fetchCategoryTypeTargetCells (which reads trigger_overrides).
  fetchReadinessRule: () => ReturnType<typeof fetchReadinessRule>;
  // #410 / #411 Settings > Multiply: the per-type (Audience) rules — the MIDDLE
  // tier of the cascade — for the current ministry year. Bound to the year so the
  // seam stays zero-arg.
  fetchAudienceReadinessRules: () => ReturnType<
    typeof fetchAudienceReadinessRules
  >;
  // #378 Leader-Health Rubric: the symmetric per-leader rubric, bound to the
  // "leader" kind. Same shared reader, filtered to the other rubric row.
  fetchLeaderHealthRubric: () => ReturnType<typeof fetchHealthRubric>;
  // #396 / #412 Settings > Groups: the live category catalog. The group-type list
  // is built from the per-cell target reads below; the catalog feeds the create
  // flow's shared-label dedupe (the same label under a second Audience reuses one
  // category).
  fetchGroupCategories: OmitClient<typeof fetchGroupCategories>;
  // #400 Settings > Groups: per-cell coverage ("have X of Y"). The cell rows WITH
  // their target_count (Y) and every non-closed group's cell + lifecycle (X) feed
  // the pure buildCellCoverage resolver.
  fetchCategoryTypeTargetCells: OmitClient<typeof fetchCategoryTypeTargetCells>;
  fetchGroupCellLifecycleRows: OmitClient<typeof fetchGroupCellLifecycleRows>;
  // Settings > Groups: the category-picker options per top type, for the inline
  // edit drawer the group-type list now opens. Same per-audience read the Groups
  // page uses (group-management-data); a failed read just narrows the picker.
  fetchCategoriesForAudience: OmitClient<typeof fetchCategoriesForAudience>;
};

export function supabaseSettingsReads(
  client: AppSupabaseClient
): SettingsReads {
  return {
    ...bindReads(client, {
      fetchMetricDefaults: fetchMetricDefaultsCached,
      fetchAllGroups,
      fetchAllGroupMetricSettings,
      fetchGroupCategories,
      fetchCategoryTypeTargetCells,
      fetchGroupCellLifecycleRows,
      fetchCategoriesForAudience,
    }),
    fetchGroupHealthRubric: () => fetchHealthRubric(client, "group"),
    fetchReadinessRule: () =>
      fetchReadinessRule(client, currentMinistryYear(new Date())),
    fetchAudienceReadinessRules: () =>
      fetchAudienceReadinessRules(client, currentMinistryYear(new Date())),
    fetchLeaderHealthRubric: () => fetchHealthRubric(client, "leader"),
  };
}

// #410 / #411 / ADR 0021: index the per-type (Audience) rules — the MIDDLE tier of
// the cascade — by Audience, decoding each stored jsonb into a typed partial. A type
// with no row is simply absent (it inherits the global rule for every pillar — the
// additive default until a per-type rule is set), so the map only carries seeded
// types. The Multiply trigger editor lays each over the global rule.
function buildPerTypeRules(
  rows: AudienceReadinessRuleRow[]
): Partial<Record<GroupAudienceCategory, PerTypeReadinessRule>> {
  const out: Partial<Record<GroupAudienceCategory, PerTypeReadinessRule>> = {};
  for (const row of rows) {
    out[row.audience_category] = decodePerTypeRule(row.rule);
  }
  return out;
}

// #400 / #412: assemble the per-active-cell coverage rows ("have X of Y") — the
// rows of the Groups group-type list. Resolves each cell's label from the live
// catalog and drops cells whose category isn't live (an archived category's stale
// cell never surfaces), then defers the active-cell filter + count to the pure
// buildCellCoverage resolver. (The list re-orders these by label/Audience; the
// shortfall sort is left as a stable, meaningful default.)
function buildSettingsCellCoverage(
  categories: { id: string; label: string }[],
  targetCells: CategoryTypeTargetRow[],
  groupRows: GroupCellLifecycleRow[]
): CellCoverage[] {
  const labelById = new Map(categories.map((c) => [c.id, c.label]));
  const cells = targetCells
    .filter((cell) => labelById.has(cell.category_id))
    .map((cell) => ({
      audienceCategory: cell.audience_category,
      categoryId: cell.category_id,
      label: labelById.get(cell.category_id) ?? "",
      active: cell.active,
      target: cell.target_count,
    }));
  const groups = groupRows.map((row) => ({
    audienceCategory: row.audience_category,
    categoryId: row.category_id,
    lifecycleStatus: row.lifecycle_status,
  }));
  return sortByLargestShortfall(buildCellCoverage(cells, groups));
}

// #402 / PRD §2.4: assemble the per-cell override seeds for the readiness editor.
// Every ACTIVE cell whose category is live becomes a row, its label resolved from
// the catalog and its stored trigger_overrides jsonb decoded to a typed override
// (empty = inherits the global rule). Mirrors buildSettingsCellCoverage's
// active-cell + live-category filter so the readiness rows and the coverage rows
// agree on which cells are live.
function buildReadinessCells(
  categories: { id: string; label: string }[],
  targetCells: CategoryTypeTargetRow[]
): ReadinessCellSeed[] {
  const labelById = new Map(categories.map((c) => [c.id, c.label]));
  return targetCells
    .filter((cell) => cell.active && labelById.has(cell.category_id))
    .map((cell) => ({
      audienceCategory: cell.audience_category,
      categoryId: cell.category_id,
      label: labelById.get(cell.category_id) ?? "",
      override: decodeCellOverride(cell.trigger_overrides),
    }))
    .sort(
      (a, b) =>
        a.label.localeCompare(b.label) ||
        a.audienceCategory.localeCompare(b.audienceCategory)
    );
}

export function emptySettingsData(isSuperAdmin: boolean): SettingsShellData {
  return {
    defaults: BUILT_IN_METRIC_DEFAULTS,
    defaultsSource: "fallback",
    groups: [],
    groupMetricSettings: [],
    groupRubricCriteria: [],
    leaderRubricCriteria: [],
    groupCategories: [],
    categoriesByAudience: EMPTY_CATEGORIES_BY_AUDIENCE,
    cellCoverage: [],
    readiness: {
      ministryYear: currentMinistryYear(new Date()),
      rule: BUILT_IN_READINESS_RULE,
      perType: {},
      cells: [],
    },
    isSuperAdmin,
    errors: {
      defaults: "The database is not configured in this environment.",
      groups: "The database is not configured in this environment.",
      overrides: "The database is not configured in this environment.",
      groupRubric: "The database is not configured in this environment.",
      leaderRubric: "The database is not configured in this environment.",
      groupCategories: "The database is not configured in this environment.",
      readiness: "The database is not configured in this environment.",
    },
  };
}

export async function buildSettingsData(
  reads: SettingsReads,
  options: { isSuperAdmin: boolean }
): Promise<SettingsShellData> {
  const { isSuperAdmin } = options;

  const [
    defaultsResult,
    groupsResult,
    settingsResult,
    rubricResult,
    leaderRubricResult,
    categoriesResult,
    targetCellsResult,
    groupCellLifecycleResult,
    readinessResult,
    audienceReadinessResult,
    menCatsResult,
    womenCatsResult,
    mixedCatsResult,
  ] = await Promise.all([
    reads.fetchMetricDefaults(),
    reads.fetchAllGroups(),
    reads.fetchAllGroupMetricSettings(),
    reads.fetchGroupHealthRubric(),
    reads.fetchLeaderHealthRubric(),
    reads.fetchGroupCategories(),
    reads.fetchCategoryTypeTargetCells(),
    reads.fetchGroupCellLifecycleRows(),
    reads.fetchReadinessRule(),
    reads.fetchAudienceReadinessRules(),
    reads.fetchCategoriesForAudience("men"),
    reads.fetchCategoriesForAudience("women"),
    reads.fetchCategoriesForAudience("mixed"),
  ]);

  const decoded = decodeMetricDefaults(defaultsResult.data ?? null);

  // The category-picker options for the Groups tab's inline edit drawer, grouped
  // by top type. A failed per-type read just drops to no options for that type
  // (the picker then only offers "Uncategorized") rather than failing the tab —
  // same silent fallback the Groups page uses.
  const categoriesByAudience: CategoriesByAudience = {
    men: (menCatsResult.data ?? []).map((c) => ({ id: c.id, label: c.label })),
    women: (womenCatsResult.data ?? []).map((c) => ({
      id: c.id,
      label: c.label,
    })),
    mixed: (mixedCatsResult.data ?? []).map((c) => ({
      id: c.id,
      label: c.label,
    })),
  };

  return {
    defaults: decoded,
    defaultsSource: defaultsResult.data ? "live" : "fallback",
    groups: groupsResult.data ?? [],
    groupMetricSettings: settingsResult.data ?? [],
    groupRubricCriteria: decodeRubricCriteria(
      rubricResult.data?.criteria ?? null
    ),
    leaderRubricCriteria: decodeRubricCriteria(
      leaderRubricResult.data?.criteria ?? null
    ),
    // #412: the live catalog (id + label) the Groups create flow dedupes a typed
    // label against, so the same label under a second Audience reuses one shared
    // category. Empty for a fresh ministry; the Groups tab softens to a "not set
    // up yet" placeholder if the read fails (errors.groupCategories).
    groupCategories: (categoriesResult.data ?? []).map((c) => ({
      id: c.id,
      label: c.label,
    })),
    categoriesByAudience,
    // #400 / #412: per-active-cell coverage ("have X of Y") — one entry per row of
    // the Groups group-type list. A pure function of the catalog, the target cells,
    // and the group lifecycle rows.
    cellCoverage: buildSettingsCellCoverage(
      categoriesResult.data ?? [],
      targetCellsResult.data ?? [],
      groupCellLifecycleResult.data ?? []
    ),
    // #402 / #410 / #411 / ADR 0021: the three-tier readiness trigger the Multiply
    // sub-tab edits — the GLOBAL rule (decoded, built-in fallback), the per-type
    // (Audience) rules (the middle tier), and one row per active, live-category cell
    // (its per-cell overrides). A pure function of the rule reads + the catalog +
    // the target cells (which carry trigger_overrides).
    readiness: {
      ministryYear: currentMinistryYear(new Date()),
      rule: decodeReadinessRule(readinessResult.data?.rule ?? null),
      perType: buildPerTypeRules(audienceReadinessResult.data ?? []),
      cells: buildReadinessCells(
        categoriesResult.data ?? [],
        targetCellsResult.data ?? []
      ),
    },
    isSuperAdmin,
    errors: {
      defaults: defaultsResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
      overrides: settingsResult.error?.message ?? null,
      groupRubric: rubricResult.error?.message ?? null,
      leaderRubric: leaderRubricResult.error?.message ?? null,
      // #400 / #412 fold the catalog + coverage reads into one Groups-tab error
      // key: a failed catalog, target, or lifecycle read softens the whole tab to
      // the placeholder.
      groupCategories:
        categoriesResult.error?.message ??
        targetCellsResult.error?.message ??
        groupCellLifecycleResult.error?.message ??
        null,
      // #402 / #410: a readiness read failure surfaces on its own key so the editor
      // softens to a placeholder rather than letting an admin save over a rule that
      // merely failed to load. Both the global rule and the per-type tier fold in
      // here (either failing softens the Multiply editor); the per-cell override rows
      // depend on the catalog + target reads, so those failures fold into
      // groupCategories above.
      readiness:
        readinessResult.error?.message ??
        audienceReadinessResult.error?.message ??
        null,
    },
  };
}

export async function loadSettingsData(
  isSuperAdmin: boolean
): Promise<SettingsShellData> {
  const client = await createSupabaseServerClient();
  if (!client) return emptySettingsData(isSuperAdmin);
  return buildSettingsData(supabaseSettingsReads(client), { isSuperAdmin });
}
