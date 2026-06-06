import { createSupabaseServerClient } from "@/lib/supabase/server";
import { currentMinistryYear } from "@/components/admin/multiply/multiply-data";
import {
  buildMultiplyGrid,
  type GridCellInput,
  type MultiplyGrid,
} from "@/lib/admin/multiply-grid";
import {
  BUILT_IN_READINESS_RULE,
  decodeCellOverride,
  decodePerTypeRule,
  decodeReadinessRule,
  type PerTypeReadinessRule,
} from "@/lib/admin/cell-readiness";
import {
  fetchAudienceReadinessRules,
  fetchReadinessRule,
} from "@/lib/supabase/readiness-reads";
import type { GroupAudienceCategory } from "@/types/enums";
import {
  fetchGroupCategories,
  fetchCategoryTypeTargetCells,
  fetchGroupCellLifecycleRows,
} from "@/lib/supabase/group-categories-reads";
import {
  buildCellCoverage,
  type CoverageCellInput,
} from "@/lib/admin/cell-coverage";
import {
  EMPTY_CELL_ACTIVE_GROUP_SIZES,
  EMPTY_CELL_HEALTH_GRADES,
  EMPTY_CELL_INTEREST,
  cellHealthKey,
  cellKeyString,
  fetchCellActiveGroupSizes,
  fetchCellHealthGrades,
  fetchCellInterestCounts,
} from "@/lib/supabase/multiplication-config-reads";
import { computeCellCapacityIssue } from "@/lib/admin/cell-capacity";
import { rollUpGrades } from "@/lib/admin/multiplication-pillars";
import { interestForCell } from "@/lib/admin/prospect-interest";

// The Multiply GRID surface's data (#403 / PRD §2.5). This loader replaces the old
// per-type board loader (loadMultiplyData): the three boards folded into ONE grid
// whose rows are categories and columns are the three top types. For every cell it
// assembles the per-cell inputs the pure builder needs:
//   * applied?  — the cell's `active` flag (an unapplied cell renders blank);
//   * coverage  — `have X of Y` (#400): X = active+launching groups in the cell,
//                 Y = the cell's target_count;
//   * readiness — the recast natural-unit rule (#402) resolved global+override and
//                 evaluated against the cell's interest headcount (#399), derived
//                 capacity issue (#401), and rolled-up Group/Leader Health letters.
// The pure resolver (lib/admin/multiply-grid.ts) assembles the grid; this loader
// is the I/O seam that gathers its inputs from the reads layer (ADR 0015).

export type MultiplyGridData = {
  ministryYear: number;
  grid: MultiplyGrid;
  error: string | null;
};

export const EMPTY_MULTIPLY_GRID_DATA: MultiplyGridData = {
  ministryYear: new Date().getUTCFullYear(),
  grid: { rows: [] },
  error: "The database is not configured in this environment.",
};

export async function loadMultiplyGridData(
  now: Date = new Date()
): Promise<MultiplyGridData> {
  const ministryYear = currentMinistryYear(now);
  const client = await createSupabaseServerClient();
  if (!client) return { ...EMPTY_MULTIPLY_GRID_DATA, ministryYear };

  // First-of-month ISO — the period the grade overrides resolve their this-month
  // expiry against (the rolled-up health pillars read effective letters).
  const periodMonthIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  )
    .toISOString()
    .slice(0, 10);

  const [
    categoriesResult,
    targetCellsResult,
    groupLifecycleResult,
    readinessResult,
    perTypeReadinessResult,
    interestResult,
    cellSizesResult,
    cellHealthResult,
  ] = await Promise.all([
    fetchGroupCategories(client),
    fetchCategoryTypeTargetCells(client),
    fetchGroupCellLifecycleRows(client),
    fetchReadinessRule(client, ministryYear),
    fetchAudienceReadinessRules(client, ministryYear),
    fetchCellInterestCounts(client),
    fetchCellActiveGroupSizes(client),
    fetchCellHealthGrades(client, ministryYear, periodMonthIso),
  ]);

  const categories = categoriesResult.data ?? [];
  const targetCells = targetCellsResult.data ?? [];
  const groupRows = groupLifecycleResult.data ?? [];
  const interest = interestResult.data ?? EMPTY_CELL_INTEREST;
  const cellSizes = cellSizesResult.data ?? EMPTY_CELL_ACTIVE_GROUP_SIZES;
  const cellHealth = cellHealthResult.data ?? EMPTY_CELL_HEALTH_GRADES;
  const globalRule = decodeReadinessRule(
    readinessResult.data?.rule ?? BUILT_IN_READINESS_RULE
  );

  // The MIDDLE tier of the cascade (#410 / ADR 0021), keyed by top type. A type
  // with no row inherits the global rule for every pillar (the additive default —
  // the per-type tier is empty until a rule is set), so the map starts empty and
  // only seeded types carry a partial.
  const perTypeRules: Partial<
    Record<GroupAudienceCategory, PerTypeReadinessRule>
  > = {};
  for (const row of perTypeReadinessResult.data ?? []) {
    perTypeRules[row.audience_category] = decodePerTypeRule(row.rule);
  }

  // Coverage X per active cell ("have"), via the pure coverage resolver. Only live
  // categories' cells are considered (an archived category's stale cell is dropped,
  // mirroring the matrix + settings coverage assembly). Index it by cell key for
  // the per-cell lookup below; an absent cell defaults to have 0.
  const labelById = new Map(categories.map((c) => [c.id, c.label]));
  const coverageCells: CoverageCellInput[] = targetCells
    .filter((cell) => labelById.has(cell.category_id))
    .map((cell) => ({
      audienceCategory: cell.audience_category,
      categoryId: cell.category_id,
      label: labelById.get(cell.category_id) ?? "",
      active: cell.active,
      target: cell.target_count,
    }));
  const haveByKey = new Map<string, number>();
  for (const row of buildCellCoverage(
    coverageCells,
    groupRows.map((g) => ({
      audienceCategory: g.audience_category,
      categoryId: g.category_id,
      lifecycleStatus: g.lifecycle_status,
    }))
  )) {
    haveByKey.set(`${row.audienceCategory}:${row.categoryId}`, row.have);
  }

  // Assemble one GridCellInput per cell row. The pure builder pairs these against
  // the catalog rows, so a cell whose category isn't live is dropped there.
  const cells: GridCellInput[] = targetCells.map((cell) => {
    const type = cell.audience_category;
    const categoryId = cell.category_id;
    const healthForCell = cellHealth.get(cellHealthKey(type, categoryId));
    const capacityIssue = computeCellCapacityIssue(
      cellSizes.byCell.get(cellKeyString(type, categoryId)) ?? []
    ).isIssue;

    return {
      audienceCategory: type,
      categoryId,
      active: cell.active,
      have: haveByKey.get(`${type}:${categoryId}`) ?? 0,
      target: cell.target_count,
      override: decodeCellOverride(cell.trigger_overrides),
      inputs: {
        interestCount: interestForCell(interest, type, categoryId),
        capacityIssue,
        groupHealth: rollUpGrades(healthForCell?.groupGrades ?? []),
        leaderHealth: rollUpGrades(healthForCell?.leaderGrades ?? []),
      },
    };
  });

  return {
    ministryYear,
    grid: buildMultiplyGrid(
      categories.map((c) => ({ id: c.id, label: c.label })),
      cells,
      globalRule,
      perTypeRules
    ),
    error:
      categoriesResult.error?.message ??
      targetCellsResult.error?.message ??
      groupLifecycleResult.error?.message ??
      readinessResult.error?.message ??
      perTypeReadinessResult.error?.message ??
      interestResult.error?.message ??
      cellSizesResult.error?.message ??
      cellHealthResult.error?.message ??
      null,
  };
}
