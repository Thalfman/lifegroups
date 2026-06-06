import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GroupAudienceCategory } from "@/types/enums";
import { ministryYearOf } from "@/lib/admin/ministry-year";
import {
  BUILT_IN_PILLAR_THRESHOLDS,
  computePillars,
  decodeFedCapacity,
  decodePillarThresholds,
  decodeTriggerRubric,
  evaluateTrigger,
  flagIndividualGroupMultiply,
  type FedCapacity,
  type MultiplySignal,
  type PillarGrades,
  type PillarThresholds,
  type TriggerRubric,
  type IndividualMultiplyFlag,
} from "@/lib/admin/multiplication-pillars";
import {
  EMPTY_FUNNEL_VOLUME,
  EMPTY_HEALTH_GRADES,
  fetchFunnelVolumeByType,
  fetchHealthGradesByType,
  fetchMultiplicationConfigs,
  type FunnelVolumeByType,
  type HealthGradesByType,
} from "@/lib/supabase/multiplication-config-reads";
import type { HealthLetter } from "@/lib/admin/multiplication-pillars";

// The Multiply surface's data (#380): three boards by group type, each with its
// four pillar A–F grades, its trigger/multiply signal, the individual-group flag,
// and the editable config that fed it. The pillar + trigger math is the pure
// resolver; this loader supplies its inputs — the fed config, the funnel volume,
// and the per-type Group/Leader Health grades rolled up from #377/#378 over the
// Ministry Year. A type with no grades yet yields empty arrays, so its health
// pillars render "—".

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
  individualFlag: IndividualMultiplyFlag;
  // The config that fed this board, surfaced so the Settings editor can prefill.
  thresholds: PillarThresholds;
  trigger: TriggerRubric;
  fedCapacity: FedCapacity;
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
    capacity: { op: "atLeast", letter: "B" },
    interest: { op: "atLeast", letter: "C" },
  },
  requireHealthGrades: false,
};

const EMPTY_FED_CAPACITY: FedCapacity = {
  headroom: null,
  fullGroupCount: 0,
  options: [],
};

// Compose one type's board from its (possibly absent) config, funnel volume, and
// the type's rolled-up Group/Leader Health grades (#377/#378). Pure — exported
// for testing. Empty grade arrays resolve the corresponding health pillar to null
// ("—"), so a type with no grades yet still renders.
export function buildTypeBoard(
  type: GroupAudienceCategory,
  config: {
    thresholds: PillarThresholds;
    trigger: TriggerRubric;
    fedCapacity: FedCapacity;
  } | null,
  funnelVolume: number,
  ministryYear: number,
  grades: { groupGrades: HealthLetter[]; leaderGrades: HealthLetter[] } = {
    groupGrades: [],
    leaderGrades: [],
  }
): TypeBoard {
  const thresholds = config?.thresholds ?? BUILT_IN_PILLAR_THRESHOLDS;
  const trigger = config?.trigger ?? DEFAULT_TRIGGER;
  const fedCapacity = config?.fedCapacity ?? EMPTY_FED_CAPACITY;

  const pillars = computePillars(
    {
      funnelVolume,
      groupGrades: grades.groupGrades,
      leaderGrades: grades.leaderGrades,
      fedCapacity,
    },
    thresholds,
    ministryYear
  );

  return {
    type,
    label: MULTIPLY_TYPE_LABEL[type],
    pillars,
    signal: evaluateTrigger(trigger, pillars),
    individualFlag: flagIndividualGroupMultiply(fedCapacity),
    thresholds,
    trigger,
    fedCapacity,
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

  const [configsResult, volumeResult, gradesResult] = await Promise.all([
    fetchMultiplicationConfigs(client, ministryYear),
    fetchFunnelVolumeByType(client),
    fetchHealthGradesByType(client, ministryYear, periodMonthIso),
  ]);

  const volume: FunnelVolumeByType = volumeResult.data ?? EMPTY_FUNNEL_VOLUME;
  const grades: HealthGradesByType = gradesResult.data ?? EMPTY_HEALTH_GRADES;

  // Index the config rows by type, decoding each jsonb payload at the boundary.
  const configByType = new Map<
    GroupAudienceCategory,
    {
      thresholds: PillarThresholds;
      trigger: TriggerRubric;
      fedCapacity: FedCapacity;
    }
  >();
  for (const row of configsResult.data ?? []) {
    configByType.set(row.group_type, {
      thresholds: decodePillarThresholds(row.thresholds),
      trigger: decodeTriggerRubric(row.trigger_rubric),
      fedCapacity: decodeFedCapacity(row.fed_capacity),
    });
  }

  const boards = MULTIPLY_TYPES.map((type) =>
    buildTypeBoard(
      type,
      configByType.get(type) ?? null,
      volume[type],
      ministryYear,
      grades[type]
    )
  );

  return {
    ministryYear,
    boards,
    error:
      configsResult.error?.message ??
      volumeResult.error?.message ??
      gradesResult.error?.message ??
      null,
  };
}
