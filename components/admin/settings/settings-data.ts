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
import { fetchMultiplicationConfigs } from "@/lib/supabase/multiplication-config-reads";
import {
  BUILT_IN_PILLAR_THRESHOLDS,
  decodePillarThresholds,
  decodeTriggerRubric,
  type PillarThresholds,
  type TriggerRubric,
} from "@/lib/admin/multiplication-pillars";
import {
  MULTIPLY_TYPES,
  MULTIPLY_TYPE_LABEL,
  currentMinistryYear,
} from "@/components/admin/multiply/multiply-data";
import type { MultiplicationConfigSeed } from "@/components/admin/settings/multiplication-config-editor";
import {
  fetchCategoryTypeCells,
  fetchCategoryTypeTargetCells,
  fetchGroupCategories,
  fetchGroupCellLifecycleRows,
  type CategoryTypeTargetRow,
  type GroupCellLifecycleRow,
} from "@/lib/supabase/group-categories-reads";
import { buildCategoryMatrix } from "@/lib/admin/group-category-matrix";
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
  // #380 Multiplication Pillars: the per-type config rows for the current
  // ministry year. Bound to the current year so the seam stays zero-arg.
  fetchMultiplicationConfigs: () => ReturnType<
    typeof fetchMultiplicationConfigs
  >;
  // #378 Leader-Health Rubric: the symmetric per-leader rubric, bound to the
  // "leader" kind. Same shared reader, filtered to the other rubric row.
  fetchLeaderHealthRubric: () => ReturnType<typeof fetchHealthRubric>;
  // #396 Settings > Groups: the live category catalog and every cell row. The
  // matrix (rows = categories, columns = the three top types) is built purely
  // from these two reads.
  fetchGroupCategories: OmitClient<typeof fetchGroupCategories>;
  fetchCategoryTypeCells: OmitClient<typeof fetchCategoryTypeCells>;
  // #400 Settings > Groups: per-cell coverage ("have X of Y"). The cell rows WITH
  // their target_count (Y) and every non-closed group's cell + lifecycle (X) feed
  // the pure buildCellCoverage resolver.
  fetchCategoryTypeTargetCells: OmitClient<typeof fetchCategoryTypeTargetCells>;
  fetchGroupCellLifecycleRows: OmitClient<typeof fetchGroupCellLifecycleRows>;
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
      fetchCategoryTypeCells,
      fetchCategoryTypeTargetCells,
      fetchGroupCellLifecycleRows,
    }),
    fetchGroupHealthRubric: () => fetchHealthRubric(client, "group"),
    fetchMultiplicationConfigs: () =>
      fetchMultiplicationConfigs(client, currentMinistryYear(new Date())),
    fetchLeaderHealthRubric: () => fetchHealthRubric(client, "leader"),
  };
}

// The default trigger a type uses until Julian configures one — a light gate so a
// fresh ministry sees a sensible "ready?" answer rather than a blank one. Mirrors
// the default in multiply-data.ts.
const DEFAULT_TRIGGER: TriggerRubric = {
  conditions: {
    interest: { op: "atLeast", letter: "C" },
  },
  requireHealthGrades: false,
};

// Build the per-type editor seeds for the Settings Multiply-config editor from
// the decoded config rows (indexed by type). Each type gets its stored config or
// a built-in fallback, so all three types are always editable. #401: capacity is
// no longer fed here — it is a derived per-cell issue, so no fedCapacity seed.
function buildMultiplicationSeeds(
  configByType: Map<
    string,
    {
      thresholds: PillarThresholds;
      trigger: TriggerRubric;
    }
  >
): MultiplicationConfigSeed[] {
  return MULTIPLY_TYPES.map((type) => {
    const config = configByType.get(type);
    return {
      type,
      label: MULTIPLY_TYPE_LABEL[type],
      thresholds: config?.thresholds ?? BUILT_IN_PILLAR_THRESHOLDS,
      trigger: config?.trigger ?? DEFAULT_TRIGGER,
    };
  });
}

// #400: assemble the per-cell coverage rows ("have X of Y"), sorted by largest
// shortfall for the dedicated panel. Resolves each cell's label from the live
// catalog and drops cells whose category isn't live (an archived category's
// stale cell never surfaces), then defers the active-cell filter + count to the
// pure buildCellCoverage resolver.
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

export function emptySettingsData(isSuperAdmin: boolean): SettingsShellData {
  return {
    defaults: BUILT_IN_METRIC_DEFAULTS,
    defaultsSource: "fallback",
    groups: [],
    groupMetricSettings: [],
    groupRubricCriteria: [],
    multiplicationConfig: {
      ministryYear: currentMinistryYear(new Date()),
      seeds: buildMultiplicationSeeds(new Map()),
    },
    leaderRubricCriteria: [],
    categoryMatrix: { rows: [] },
    cellCoverage: [],
    isSuperAdmin,
    errors: {
      defaults: "The database is not configured in this environment.",
      groups: "The database is not configured in this environment.",
      overrides: "The database is not configured in this environment.",
      multiplication: "The database is not configured in this environment.",
      groupRubric: "The database is not configured in this environment.",
      leaderRubric: "The database is not configured in this environment.",
      groupCategories: "The database is not configured in this environment.",
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
    multiplicationResult,
    leaderRubricResult,
    categoriesResult,
    cellsResult,
    targetCellsResult,
    groupCellLifecycleResult,
  ] = await Promise.all([
    reads.fetchMetricDefaults(),
    reads.fetchAllGroups(),
    reads.fetchAllGroupMetricSettings(),
    reads.fetchGroupHealthRubric(),
    reads.fetchMultiplicationConfigs(),
    reads.fetchLeaderHealthRubric(),
    reads.fetchGroupCategories(),
    reads.fetchCategoryTypeCells(),
    reads.fetchCategoryTypeTargetCells(),
    reads.fetchGroupCellLifecycleRows(),
  ]);

  const decoded = decodeMetricDefaults(defaultsResult.data ?? null);

  // #380: index the per-type config rows, decoding each jsonb payload, and build
  // the editor seeds (all three types, with built-in fallbacks). #401: fed
  // capacity is no longer decoded — it was retired in favour of the derived issue.
  const configByType = new Map<
    string,
    {
      thresholds: PillarThresholds;
      trigger: TriggerRubric;
    }
  >();
  for (const row of multiplicationResult.data ?? []) {
    configByType.set(row.group_type, {
      thresholds: decodePillarThresholds(row.thresholds),
      trigger: decodeTriggerRubric(row.trigger_rubric),
    });
  }

  return {
    defaults: decoded,
    defaultsSource: defaultsResult.data ? "live" : "fallback",
    groups: groupsResult.data ?? [],
    groupMetricSettings: settingsResult.data ?? [],
    groupRubricCriteria: decodeRubricCriteria(
      rubricResult.data?.criteria ?? null
    ),
    multiplicationConfig: {
      ministryYear: currentMinistryYear(new Date()),
      seeds: buildMultiplicationSeeds(configByType),
    },
    leaderRubricCriteria: decodeRubricCriteria(
      leaderRubricResult.data?.criteria ?? null
    ),
    // #396: the type×category matrix is a pure function of the catalog + the cell
    // rows. A single error key covers both reads — the Groups tab softens to a
    // "not set up yet" placeholder if either fails (e.g. an unmigrated env).
    categoryMatrix: buildCategoryMatrix(
      categoriesResult.data ?? [],
      cellsResult.data ?? []
    ),
    // #400: per-active-cell coverage ("have X of Y"), sorted by largest shortfall
    // for the dedicated panel. A pure function of the catalog, the target cells,
    // and the group lifecycle rows; the inline readout reads the same rows.
    cellCoverage: buildSettingsCellCoverage(
      categoriesResult.data ?? [],
      targetCellsResult.data ?? [],
      groupCellLifecycleResult.data ?? []
    ),
    isSuperAdmin,
    errors: {
      defaults: defaultsResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
      overrides: settingsResult.error?.message ?? null,
      multiplication: multiplicationResult.error?.message ?? null,
      groupRubric: rubricResult.error?.message ?? null,
      leaderRubric: leaderRubricResult.error?.message ?? null,
      // #400 folds the coverage reads into the same Groups-tab error key: a
      // failed target/lifecycle read softens the whole tab to the placeholder.
      groupCategories:
        categoriesResult.error?.message ??
        cellsResult.error?.message ??
        targetCellsResult.error?.message ??
        groupCellLifecycleResult.error?.message ??
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
