import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchAllGroupLeaders,
  fetchOutstandingCareFollowUpsForAdmin,
  fetchOverShepherdsForAdmin,
  fetchRecentShepherdCareInteractionsForAdmin,
  fetchRecentlyCompletedCareFollowUpsForAdmin,
  fetchShepherdCareDirectoryForAdmin,
  type ActiveShepherdCoverageAssignmentSummary,
  type CareFollowUpCompletedRow,
  type CareFollowUpDashboardRow,
  type OverShepherdListRow,
  type ShepherdCareDirectoryEntry,
  type ShepherdCareRecentInteractionRow,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import {
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import type { CareCadenceWindows } from "@/lib/admin/shepherd-care-cadence";

// The Care area's data (ADR 0013), as a function of the reads seam (ADR 0015).
// Same directory waterfall and availability-flag discipline as the Leader-care
// surface, now testable through an in-memory adapter.

export type CareData = {
  entries: ShepherdCareDirectoryEntry[];
  assignments: ActiveShepherdCoverageAssignmentSummary[];
  assignmentsAvailable: boolean;
  overShepherds: OverShepherdListRow[];
  recentInteractions: ShepherdCareRecentInteractionRow[];
  outstandingFollowUps: CareFollowUpDashboardRow[];
  outstandingFollowUpsAvailable: boolean;
  completedFollowUps: CareFollowUpCompletedRow[];
  groupLeaders: { profile_id: string; group_id: string }[];
  windows: CareCadenceWindows;
  error: string | null;
};

export type CareReads = {
  fetchOverShepherds: OmitClient<typeof fetchOverShepherdsForAdmin>;
  fetchActiveCoverageAssignments: OmitClient<
    typeof fetchActiveShepherdCoverageAssignmentsForAdmin
  >;
  fetchRecentInteractions: OmitClient<
    typeof fetchRecentShepherdCareInteractionsForAdmin
  >;
  fetchOutstandingCareFollowUps: OmitClient<
    typeof fetchOutstandingCareFollowUpsForAdmin
  >;
  fetchRecentlyCompletedCareFollowUps: OmitClient<
    typeof fetchRecentlyCompletedCareFollowUpsForAdmin
  >;
  fetchMetricDefaults: OmitClient<typeof fetchMetricDefaultsCached>;
  fetchAllGroupLeaders: OmitClient<typeof fetchAllGroupLeaders>;
  fetchShepherdCareDirectory: OmitClient<
    typeof fetchShepherdCareDirectoryForAdmin
  >;
};

export function supabaseCareReads(client: AppSupabaseClient): CareReads {
  return bindReads(client, {
    fetchOverShepherds: fetchOverShepherdsForAdmin,
    fetchActiveCoverageAssignments:
      fetchActiveShepherdCoverageAssignmentsForAdmin,
    fetchRecentInteractions: fetchRecentShepherdCareInteractionsForAdmin,
    fetchOutstandingCareFollowUps: fetchOutstandingCareFollowUpsForAdmin,
    fetchRecentlyCompletedCareFollowUps:
      fetchRecentlyCompletedCareFollowUpsForAdmin,
    fetchMetricDefaults: fetchMetricDefaultsCached,
    fetchAllGroupLeaders,
    fetchShepherdCareDirectory: fetchShepherdCareDirectoryForAdmin,
  });
}

export function emptyCareData(error: string): CareData {
  return {
    entries: [],
    assignments: [],
    assignmentsAvailable: false,
    overShepherds: [],
    recentInteractions: [],
    outstandingFollowUps: [],
    outstandingFollowUpsAvailable: false,
    completedFollowUps: [],
    groupLeaders: [],
    windows: careCadenceWindowsFromDefaults(decodeMetricDefaults(null)),
    error,
  };
}

export async function buildCareData(
  reads: CareReads,
  options: { todayIso: string }
): Promise<CareData> {
  const todayIso = options.todayIso;

  // The directory needs the configured staleness windows + the active-coverage
  // set (so its needs_attention matches the dashboard's), so resolve those
  // first; everything else is independent and joins the batch.
  const [
    overShepherdsRes,
    assignmentsRes,
    recentRes,
    outstandingRes,
    completedRes,
    metricDefaultsRes,
    groupLeadersRes,
  ] = await Promise.all([
    reads.fetchOverShepherds({ includeArchived: true }),
    reads.fetchActiveCoverageAssignments(),
    reads.fetchRecentInteractions({ limit: 30 }),
    reads.fetchOutstandingCareFollowUps(),
    reads.fetchRecentlyCompletedCareFollowUps({ limit: 50 }),
    reads.fetchMetricDefaults(),
    reads.fetchAllGroupLeaders({ activeOnly: true }),
  ]);

  const windows = careCadenceWindowsFromDefaults(
    decodeMetricDefaults(metricDefaultsRes.data ?? null)
  );
  const delegatedShepherdIds = assignmentsRes.error
    ? undefined
    : new Set((assignmentsRes.data ?? []).map((a) => a.shepherd_profile_id));

  const directory = await reads.fetchShepherdCareDirectory({
    todayIso,
    windows,
    delegatedShepherdIds,
  });
  if (directory.error) return emptyCareData(directory.error.message);

  return {
    entries: directory.data,
    assignments: assignmentsRes.data ?? [],
    assignmentsAvailable: assignmentsRes.error === null,
    overShepherds: overShepherdsRes.data ?? [],
    recentInteractions: recentRes.data ?? [],
    outstandingFollowUps: outstandingRes.data ?? [],
    outstandingFollowUpsAvailable: outstandingRes.error === null,
    completedFollowUps: completedRes.data ?? [],
    // Only leader / co_leader rows describe groups a care target *leads*;
    // group_leaders also carries role = 'member' rows, which must not show up as
    // a led/related group in the Care tabs.
    groupLeaders: (groupLeadersRes.data ?? [])
      .filter((r) => r.role === "leader" || r.role === "co_leader")
      .map((r) => ({ profile_id: r.profile_id, group_id: r.group_id })),
    windows,
    error:
      overShepherdsRes.error?.message ??
      assignmentsRes.error?.message ??
      recentRes.error?.message ??
      outstandingRes.error?.message ??
      completedRes.error?.message ??
      metricDefaultsRes.error?.message ??
      groupLeadersRes.error?.message ??
      null,
  };
}

export async function loadCareData(todayIso: string): Promise<CareData> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return emptyCareData("Database is not configured in this environment.");
  }
  return buildCareData(supabaseCareReads(client), { todayIso });
}
