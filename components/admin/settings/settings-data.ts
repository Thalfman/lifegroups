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
  decodeFedCapacity,
  decodePillarThresholds,
  decodeTriggerRubric,
  type FedCapacity,
  type PillarThresholds,
  type TriggerRubric,
} from "@/lib/admin/multiplication-pillars";
import {
  MULTIPLY_TYPES,
  MULTIPLY_TYPE_LABEL,
  currentMinistryYear,
} from "@/components/admin/multiply/multiply-data";
import type { MultiplicationConfigSeed } from "@/components/admin/settings/multiplication-config-editor";

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
};

export function supabaseSettingsReads(
  client: AppSupabaseClient
): SettingsReads {
  return {
    ...bindReads(client, {
      fetchMetricDefaults: fetchMetricDefaultsCached,
      fetchAllGroups,
      fetchAllGroupMetricSettings,
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

// Build the per-type editor seeds for the Settings Multiply-config editor from
// the decoded config rows (indexed by type). Each type gets its stored config or
// a built-in fallback, so all three types are always editable.
function buildMultiplicationSeeds(
  configByType: Map<
    string,
    {
      thresholds: PillarThresholds;
      trigger: TriggerRubric;
      fedCapacity: FedCapacity;
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
      fedCapacity: config?.fedCapacity ?? EMPTY_FED_CAPACITY,
    };
  });
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
    isSuperAdmin,
    errors: {
      defaults: "The database is not configured in this environment.",
      groups: "The database is not configured in this environment.",
      overrides: "The database is not configured in this environment.",
      multiplication: "The database is not configured in this environment.",
      groupRubric: "The database is not configured in this environment.",
      leaderRubric: "The database is not configured in this environment.",
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
  ] = await Promise.all([
    reads.fetchMetricDefaults(),
    reads.fetchAllGroups(),
    reads.fetchAllGroupMetricSettings(),
    reads.fetchGroupHealthRubric(),
    reads.fetchMultiplicationConfigs(),
    reads.fetchLeaderHealthRubric(),
  ]);

  const decoded = decodeMetricDefaults(defaultsResult.data ?? null);

  // #380: index the per-type config rows, decoding each jsonb payload, and build
  // the editor seeds (all three types, with built-in fallbacks).
  const configByType = new Map<
    string,
    {
      thresholds: PillarThresholds;
      trigger: TriggerRubric;
      fedCapacity: FedCapacity;
    }
  >();
  for (const row of multiplicationResult.data ?? []) {
    configByType.set(row.group_type, {
      thresholds: decodePillarThresholds(row.thresholds),
      trigger: decodeTriggerRubric(row.trigger_rubric),
      fedCapacity: decodeFedCapacity(row.fed_capacity),
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
    isSuperAdmin,
    errors: {
      defaults: defaultsResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
      overrides: settingsResult.error?.message ?? null,
      multiplication: multiplicationResult.error?.message ?? null,
      groupRubric: rubricResult.error?.message ?? null,
      leaderRubric: leaderRubricResult.error?.message ?? null,
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
