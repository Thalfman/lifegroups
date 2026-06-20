import type { SettingsShellData } from "@/components/admin/settings-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import { readBatch } from "@/lib/supabase/read-batch";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchAllGroupMetricSettings,
  fetchAllGroups,
  fetchGroupTypes,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import {
  BUILT_IN_METRIC_DEFAULTS,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import { fetchHealthRubric } from "@/lib/supabase/health-rubric-reads";
import {
  decodeRubricCriteria,
  DEFAULT_GROUP_RUBRIC_CRITERIA,
} from "@/lib/admin/health-rubric";
import { fetchReadinessRule } from "@/lib/supabase/readiness-reads";
import {
  BUILT_IN_READINESS_RULE,
  decodeReadinessRuleWithReport,
} from "@/lib/admin/cell-readiness";
import { currentMinistryYear } from "@/components/admin/multiply/multiply-data";

// The Settings surface's data, as a function of the reads seam (ADR 0015). The
// build function takes `isSuperAdmin` only to record it on the shell data (the
// System tab gates bulk people import on it); it crosses no Super-Admin-only
// read here.

export type SettingsReads = {
  fetchMetricDefaults: OmitClient<typeof fetchMetricDefaultsCached>;
  fetchAllGroups: OmitClient<typeof fetchAllGroups>;
  fetchAllGroupMetricSettings: OmitClient<typeof fetchAllGroupMetricSettings>;
  // The current group rubric (Ministry-Admin-owned). Bound to the "group" kind
  // here so the seam exposes a zero-arg read like the rest.
  fetchGroupHealthRubric: () => ReturnType<typeof fetchHealthRubric>;
  // The single GLOBAL readiness rule for the current ministry year. Bound to the
  // year so the seam stays zero-arg.
  fetchReadinessRule: () => ReturnType<typeof fetchReadinessRule>;
  // The symmetric per-leader rubric, bound to the "leader" kind. Same shared
  // reader, filtered to the other rubric row.
  fetchLeaderHealthRubric: () => ReturnType<typeof fetchHealthRubric>;
  // Settings > Groups: the admin-managed free-text group-type list.
  fetchGroupTypes: OmitClient<typeof fetchGroupTypes>;
};

export function supabaseSettingsReads(
  client: AppSupabaseClient
): SettingsReads {
  return {
    ...bindReads(client, {
      fetchMetricDefaults: fetchMetricDefaultsCached,
      fetchAllGroups,
      fetchAllGroupMetricSettings,
      fetchGroupTypes,
    }),
    fetchGroupHealthRubric: () => fetchHealthRubric(client, "group"),
    fetchReadinessRule: () =>
      fetchReadinessRule(client, currentMinistryYear(new Date())),
    fetchLeaderHealthRubric: () => fetchHealthRubric(client, "leader"),
  };
}

export function emptySettingsData(isSuperAdmin: boolean): SettingsShellData {
  return {
    defaults: BUILT_IN_METRIC_DEFAULTS,
    defaultsSource: "fallback",
    groups: [],
    groupMetricSettings: [],
    groupRubricCriteria: DEFAULT_GROUP_RUBRIC_CRITERIA,
    hasSavedGroupRubric: false,
    leaderRubricCriteria: [],
    groupTypes: [],
    readiness: {
      ministryYear: currentMinistryYear(new Date()),
      rule: BUILT_IN_READINESS_RULE,
      ruleFellBack: false,
    },
    isSuperAdmin,
    errors: {
      defaults: "The database is not configured in this environment.",
      groups: "The database is not configured in this environment.",
      overrides: "The database is not configured in this environment.",
      groupRubric: "The database is not configured in this environment.",
      leaderRubric: "The database is not configured in this environment.",
      groupTypes: "The database is not configured in this environment.",
      readiness: "The database is not configured in this environment.",
    },
  };
}

export async function buildSettingsData(
  reads: SettingsReads,
  options: { isSuperAdmin: boolean }
): Promise<SettingsShellData> {
  const { isSuperAdmin } = options;

  // Gather every read through the batch combinator (ADR 0015); the per-tab
  // error precedence is composed from `batch.errors` in the `errors` block
  // below, as data rather than re-implemented control flow.
  const batch = await readBatch({
    defaults: () => reads.fetchMetricDefaults(),
    groups: () => reads.fetchAllGroups(),
    overrides: () => reads.fetchAllGroupMetricSettings(),
    groupRubric: () => reads.fetchGroupHealthRubric(),
    leaderRubric: () => reads.fetchLeaderHealthRubric(),
    groupTypes: () => reads.fetchGroupTypes(),
    readinessRule: () => reads.fetchReadinessRule(),
  });

  const {
    defaults: defaultsResult,
    groups: groupsResult,
    overrides: settingsResult,
    groupRubric: rubricResult,
    leaderRubric: leaderRubricResult,
    groupTypes: groupTypesResult,
    readinessRule: readinessResult,
  } = batch.results;

  const decoded = decodeMetricDefaults(defaultsResult.data ?? null);

  // Decode the stored global trigger WITH a report. A missing stored rule
  // (fresh ministry) decodes to the built-in default with no flag; a present-
  // but-unreadable payload flags ruleFellBack so the Multiply editor can warn
  // that the stored trigger couldn't be read (and that saving will overwrite it)
  // instead of silently showing default values.
  const decodedRule = decodeReadinessRuleWithReport(
    readinessResult.data?.rule ?? null
  );

  return {
    defaults: decoded,
    defaultsSource: defaultsResult.data ? "live" : "fallback",
    groups: groupsResult.data ?? [],
    groupMetricSettings: settingsResult.data ?? [],
    // When no health_rubrics row exists (and the read didn't fail), seed the
    // editor with the working in-code default (40/40/20) instead of an
    // empty/zeroed form, and flag it so the editor shows the "starting defaults"
    // note. A FAILED read keeps `[]` so it surfaces as "couldn't load" rather
    // than fabricating a rubric an admin could save over real-but-unread data.
    groupRubricCriteria: rubricResult.data
      ? decodeRubricCriteria(rubricResult.data.criteria)
      : batch.errors.groupRubric
        ? []
        : DEFAULT_GROUP_RUBRIC_CRITERIA,
    hasSavedGroupRubric: rubricResult.data != null,
    leaderRubricCriteria: decodeRubricCriteria(
      leaderRubricResult.data?.criteria ?? null
    ),
    // The admin-managed free-text group-type list, edited in the Groups tab.
    groupTypes: groupTypesResult.data ?? [],
    // The single GLOBAL readiness rule the Multiply sub-tab edits (decoded, with
    // a built-in fallback).
    readiness: {
      ministryYear: currentMinistryYear(new Date()),
      rule: decodedRule.rule,
      ruleFellBack: decodedRule.fellBack,
    },
    isSuperAdmin,
    // Per-tab error precedence, declared as data over the batch's per-key
    // errors.
    errors: {
      defaults: batch.errors.defaults,
      groups: batch.errors.groups,
      overrides: batch.errors.overrides,
      groupRubric: batch.errors.groupRubric,
      leaderRubric: batch.errors.leaderRubric,
      groupTypes: batch.errors.groupTypes,
      readiness: batch.errors.readinessRule,
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
