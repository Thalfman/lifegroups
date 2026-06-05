import type { SettingsShellData } from "@/components/admin/settings-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchAllGroupMetricSettings,
  fetchAllGroups,
  fetchPlatformConfig,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import {
  BUILT_IN_METRIC_DEFAULTS,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import { decodeAppConfig } from "@/lib/admin/app-config-decode";
import { fetchHealthRubric } from "@/lib/supabase/health-rubric-reads";
import { decodeRubricCriteria } from "@/lib/admin/health-rubric";

// The Settings surface's data, as a function of the reads seam (ADR 0015). The
// editable-copy read is gated on the viewer being a Super Admin (platform_config
// is Super-Admin-only by RLS), so the build function takes `isSuperAdmin` and
// only crosses that read when allowed — that gating is now testable through an
// in-memory adapter.

export type SettingsReads = {
  fetchMetricDefaults: OmitClient<typeof fetchMetricDefaultsCached>;
  fetchAllGroups: OmitClient<typeof fetchAllGroups>;
  fetchAllGroupMetricSettings: OmitClient<typeof fetchAllGroupMetricSettings>;
  fetchPlatformConfig: OmitClient<typeof fetchPlatformConfig>;
  // #374 Health Rubric: the current group rubric (Ministry-Admin-owned). Bound
  // to the "group" kind here so the seam exposes a zero-arg read like the rest.
  fetchGroupHealthRubric: () => ReturnType<typeof fetchHealthRubric>;
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
      fetchPlatformConfig,
    }),
    fetchGroupHealthRubric: () => fetchHealthRubric(client, "group"),
    fetchLeaderHealthRubric: () => fetchHealthRubric(client, "leader"),
  };
}

export function emptySettingsData(isSuperAdmin: boolean): SettingsShellData {
  return {
    defaults: BUILT_IN_METRIC_DEFAULTS,
    defaultsSource: "fallback",
    groups: [],
    groupMetricSettings: [],
    groupRubricCriteria: [],
    leaderRubricCriteria: [],
    isSuperAdmin,
    editableCopy: isSuperAdmin ? {} : null,
    errors: {
      defaults: "The database is not configured in this environment.",
      groups: "The database is not configured in this environment.",
      overrides: "The database is not configured in this environment.",
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
    platformConfigResult,
    rubricResult,
    leaderRubricResult,
  ] = await Promise.all([
    reads.fetchMetricDefaults(),
    reads.fetchAllGroups(),
    reads.fetchAllGroupMetricSettings(),
    // platform_config (editable copy) is Super-Admin-only by RLS; only read it
    // for a super_admin so a ministry_admin doesn't trigger a useless query.
    // The General tab surfaces a pointer to the console for ministry admins.
    isSuperAdmin ? reads.fetchPlatformConfig() : Promise.resolve(null),
    reads.fetchGroupHealthRubric(),
    reads.fetchLeaderHealthRubric(),
  ]);

  const decoded = decodeMetricDefaults(defaultsResult.data ?? null);

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
    isSuperAdmin,
    editableCopy: isSuperAdmin
      ? decodeAppConfig(platformConfigResult?.data ?? null).editableCopy
      : null,
    errors: {
      defaults: defaultsResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
      overrides: settingsResult.error?.message ?? null,
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
