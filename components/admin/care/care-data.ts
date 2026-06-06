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
import { fetchAttentionResetBaselines } from "@/lib/supabase/maintenance-reads";
import {
  buildSurfaceBaselines,
  EMPTY_ATTENTION_BASELINES,
  type AttentionBaselines,
} from "@/lib/admin/attention-reset";
import {
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import type { CareCadenceWindows } from "@/lib/admin/shepherd-care-cadence";

// The Care surface's read-orchestration, as a pure function of a reads seam
// (ADR 0015). The Care tab (ADR 0016) is the entry point for Job 1 — "how are my
// leaders doing?" — and its assembly is NOT a flat batch: the staleness windows
// and the active-coverage set must be resolved first so the directory's
// needs_attention can never disagree with the dashboard's, then the directory is
// read with them (a deliberate waterfall). That branching plus the gather-and-
// degrade rule (a failed coverage read suppresses coverage-derived output rather
// than reporting a false zero; a failed directory read empties the surface) used
// to ride the live client inside the page, where it could only be exercised
// against a real database. It is now a function of `CareReads`: production binds
// the live client through `supabaseCareReads`; a test binds an in-memory adapter
// satisfying the same interface. Two adapters, one seam.

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
  // health-checks-reset: the care reset baselines, so /admin/care agrees with
  // Home after a reset (and with the per-leader "cleared from the queue" action).
  baselines: AttentionBaselines;
  error: string | null;
};

export type CareReads = {
  fetchOverShepherds: OmitClient<typeof fetchOverShepherdsForAdmin>;
  fetchActiveAssignments: OmitClient<
    typeof fetchActiveShepherdCoverageAssignmentsForAdmin
  >;
  fetchRecentInteractions: OmitClient<
    typeof fetchRecentShepherdCareInteractionsForAdmin
  >;
  fetchOutstandingFollowUps: OmitClient<
    typeof fetchOutstandingCareFollowUpsForAdmin
  >;
  fetchCompletedFollowUps: OmitClient<
    typeof fetchRecentlyCompletedCareFollowUpsForAdmin
  >;
  fetchMetricDefaults: OmitClient<typeof fetchMetricDefaultsCached>;
  fetchGroupLeaders: OmitClient<typeof fetchAllGroupLeaders>;
  fetchAttentionBaselines: OmitClient<typeof fetchAttentionResetBaselines>;
  fetchCareDirectory: OmitClient<typeof fetchShepherdCareDirectoryForAdmin>;
};

// Production adapter: binds the live Supabase client to every read this surface
// needs.
export function supabaseCareReads(client: AppSupabaseClient): CareReads {
  return bindReads(client, {
    fetchOverShepherds: fetchOverShepherdsForAdmin,
    fetchActiveAssignments: fetchActiveShepherdCoverageAssignmentsForAdmin,
    fetchRecentInteractions: fetchRecentShepherdCareInteractionsForAdmin,
    fetchOutstandingFollowUps: fetchOutstandingCareFollowUpsForAdmin,
    fetchCompletedFollowUps: fetchRecentlyCompletedCareFollowUpsForAdmin,
    fetchMetricDefaults: fetchMetricDefaultsCached,
    fetchGroupLeaders: fetchAllGroupLeaders,
    fetchAttentionBaselines: fetchAttentionResetBaselines,
    fetchCareDirectory: fetchShepherdCareDirectoryForAdmin,
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
    baselines: EMPTY_ATTENTION_BASELINES,
    error,
  };
}

// Pure assembly: gather the independent reads, resolve the windows + active-
// coverage set + baselines, then waterfall the directory read with them. The
// directory is the one read that depends on the others, so it cannot join the
// parallel batch. Every degrade path is reachable from a test through an
// in-memory `reads` adapter.
export async function buildCareData(
  reads: CareReads,
  options: { todayIso: string }
): Promise<CareData> {
  const { todayIso } = options;

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
    attentionBaselinesRes,
  ] = await Promise.all([
    reads.fetchOverShepherds({ includeArchived: true }),
    reads.fetchActiveAssignments(),
    reads.fetchRecentInteractions({ limit: 30 }),
    reads.fetchOutstandingFollowUps(),
    reads.fetchCompletedFollowUps({ limit: 50 }),
    reads.fetchMetricDefaults(),
    reads.fetchGroupLeaders({ activeOnly: true }),
    reads.fetchAttentionBaselines(),
  ]);

  const windows = careCadenceWindowsFromDefaults(
    decodeMetricDefaults(metricDefaultsRes.data ?? null)
  );
  const delegatedShepherdIds = assignmentsRes.error
    ? undefined
    : new Set((assignmentsRes.data ?? []).map((a) => a.shepherd_profile_id));
  // A failed baselines read degrades to "no baselines" (today's behaviour),
  // never fails the page.
  const baselines = buildSurfaceBaselines(
    attentionBaselinesRes.data ?? [],
    "care"
  );

  const directory = await reads.fetchCareDirectory({
    todayIso,
    windows,
    delegatedShepherdIds,
    baselines,
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
    baselines,
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

// Binds the live client (or returns the documented empty shape when the DB is
// not configured) and runs the pure assembly. The calling page is unchanged.
export async function loadCareData(todayIso: string): Promise<CareData> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return emptyCareData("Database is not configured in this environment.");
  }
  return buildCareData(supabaseCareReads(client), { todayIso });
}
