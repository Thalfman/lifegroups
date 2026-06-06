import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GroupAudienceCategory } from "@/types/enums";
import { ministryYearOf } from "@/lib/admin/ministry-year";
import {
  BUILT_IN_PILLAR_THRESHOLDS,
  computePillars,
  decodePillarThresholds,
  decodeTriggerRubric,
  evaluateTrigger,
  type MultiplySignal,
  type PillarGrades,
  type PillarThresholds,
  type TriggerRubric,
} from "@/lib/admin/multiplication-pillars";
import {
  NO_TYPE_CAPACITY_ISSUE,
  rollUpTypeCapacityIssue,
  type TypeCapacityIssue,
} from "@/lib/admin/cell-capacity";
import {
  EMPTY_CELL_ACTIVE_GROUP_SIZES,
  EMPTY_FUNNEL_VOLUME,
  EMPTY_HEALTH_GRADES,
  fetchCellActiveGroupSizes,
  fetchFunnelVolumeByType,
  fetchHealthGradesByType,
  fetchMultiplicationConfigs,
  type CellActiveGroupSizes,
  type FunnelVolumeByType,
  type HealthGradesByType,
} from "@/lib/supabase/multiplication-config-reads";
import type { HealthLetter } from "@/lib/admin/multiplication-pillars";

// The Multiply surface's data (#380, updated #401): three boards by group type,
// each with its A–F pillar grades (Interest, Group Health, Leader Health), its
// trigger/multiply signal, the DERIVED per-cell capacity ISSUE rolled up to the
// type, and the editable config that fed it. The pillar + trigger math is the pure
// resolver; this loader supplies its inputs — the config, the funnel volume, the
// per-type Group/Leader Health grades, and the per-cell active group sizes.
//
// Capacity is no longer fed. It is a derived, multi-faceted ISSUE computed per
// CELL (lib/admin/cell-capacity.ts) and rolled up here to the type level (a type
// has an issue when ANY of its active cells trips). NOTE: the full Multiply matrix
// grid (rows = categories × cols = types) is a LATER slice (#403), where this
// per-cell signal moves onto the individual grid cell; this type-level rollup is
// the interim surface for the existing per-type boards.

export const MULTIPLY_TYPES: readonly GroupAudienceCategory[] = [
  "men",
  "women",
  "mixed",
];

export const MULTIPLY_TYPE_LABEL: Record<GroupAudienceCategory, string> = {
  men: "Men's",
  women: "Women's",
  mixed: "Mixed",
};

// One type's full board view.
export type TypeBoard = {
  type: GroupAudienceCategory;
  label: string;
  pillars: PillarGrades;
  signal: MultiplySignal;
  // The derived per-cell capacity issue rolled up to this type (#401).
  capacityIssue: TypeCapacityIssue;
  // The config that fed this board, surfaced so the Settings editor can prefill.
  thresholds: PillarThresholds;
  trigger: TriggerRubric;
  // The funnel volume that drove the Interest pillar (shown for transparency).
  funnelVolume: number;
  // True when no config row exists yet for this type/year (built-ins in use).
  usingDefaults: boolean;
};

export type MultiplyData = {
  ministryYear: number;
  boards: TypeBoard[];
  error: string | null;
};

// The current ministry year for the boards. In the Jun/Jul off-season there is no
// active ministry year; the boards then plan for the year whose August is next
// (the current calendar year), so the surface is never blank in summer.
export function currentMinistryYear(now: Date): number {
  const located = ministryYearOf(now);
  return located.year ?? now.getUTCFullYear();
}

const DEFAULT_TRIGGER: TriggerRubric = {
  conditions: {
    interest: { op: "atLeast", letter: "C" },
  },
  requireHealthGrades: false,
};

// Collect a type's per-cell active group sizes from the cell-sizes read: every
// cell whose audience matches this type, as a list of size-arrays for the rollup.
function typeCellSizes(
  type: GroupAudienceCategory,
  cellSizes: CellActiveGroupSizes
): number[][] {
  const cells: number[][] = [];
  for (const [key, sizes] of cellSizes.byCell) {
    if (cellSizes.keys.get(key)?.audience === type) cells.push(sizes);
  }
  return cells;
}

// Compose one type's board from its (possibly absent) config, funnel volume, the
// type's rolled-up Group/Leader Health grades (#377/#378), and the type's per-cell
// active group sizes for the derived capacity issue (#401). Pure — exported for
// testing. Empty grade arrays resolve the corresponding health pillar to null
// ("—"), so a type with no grades yet still renders.
export function buildTypeBoard(
  type: GroupAudienceCategory,
  config: {
    thresholds: PillarThresholds;
    trigger: TriggerRubric;
  } | null,
  funnelVolume: number,
  ministryYear: number,
  grades: { groupGrades: HealthLetter[]; leaderGrades: HealthLetter[] } = {
    groupGrades: [],
    leaderGrades: [],
  },
  cellSizes: number[][] = []
): TypeBoard {
  const thresholds = config?.thresholds ?? BUILT_IN_PILLAR_THRESHOLDS;
  const trigger = config?.trigger ?? DEFAULT_TRIGGER;

  const pillars = computePillars(
    {
      funnelVolume,
      groupGrades: grades.groupGrades,
      leaderGrades: grades.leaderGrades,
    },
    thresholds,
    ministryYear
  );

  return {
    type,
    label: MULTIPLY_TYPE_LABEL[type],
    pillars,
    signal: evaluateTrigger(trigger, pillars),
    capacityIssue: rollUpTypeCapacityIssue(cellSizes),
    thresholds,
    trigger,
    funnelVolume,
    usingDefaults: config === null,
  };
}

export const EMPTY_MULTIPLY_DATA: MultiplyData = {
  ministryYear: new Date().getUTCFullYear(),
  boards: [],
  error: "The database is not configured in this environment.",
};

export async function loadMultiplyData(
  now: Date = new Date()
): Promise<MultiplyData> {
  const ministryYear = currentMinistryYear(now);
  const client = await createSupabaseServerClient();
  if (!client) return { ...EMPTY_MULTIPLY_DATA, ministryYear };

  // First-of-month ISO — the period the grade overrides resolve their this-month
  // expiry against (the rolled-up health pillars read effective letters).
  const periodMonthIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  )
    .toISOString()
    .slice(0, 10);

  const [configsResult, volumeResult, gradesResult, cellSizesResult] =
    await Promise.all([
      fetchMultiplicationConfigs(client, ministryYear),
      fetchFunnelVolumeByType(client),
      fetchHealthGradesByType(client, ministryYear, periodMonthIso),
      fetchCellActiveGroupSizes(client),
    ]);

  const volume: FunnelVolumeByType = volumeResult.data ?? EMPTY_FUNNEL_VOLUME;
  const grades: HealthGradesByType = gradesResult.data ?? EMPTY_HEALTH_GRADES;
  const cellSizes: CellActiveGroupSizes =
    cellSizesResult.data ?? EMPTY_CELL_ACTIVE_GROUP_SIZES;

  // Index the config rows by type, decoding each jsonb payload at the boundary.
  const configByType = new Map<
    GroupAudienceCategory,
    {
      thresholds: PillarThresholds;
      trigger: TriggerRubric;
    }
  >();
  for (const row of configsResult.data ?? []) {
    configByType.set(row.group_type, {
      thresholds: decodePillarThresholds(row.thresholds),
      trigger: decodeTriggerRubric(row.trigger_rubric),
    });
  }

  const boards = MULTIPLY_TYPES.map((type) =>
    buildTypeBoard(
      type,
      configByType.get(type) ?? null,
      volume[type],
      ministryYear,
      grades[type],
      typeCellSizes(type, cellSizes)
    )
  );

  return {
    ministryYear,
    boards,
    error:
      configsResult.error?.message ??
      volumeResult.error?.message ??
      gradesResult.error?.message ??
      cellSizesResult.error?.message ??
      null,
  };
}
