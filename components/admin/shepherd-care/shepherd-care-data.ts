import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchOutstandingCareFollowUpsForAdmin,
  fetchOverShepherdsForAdmin,
  fetchRecentShepherdCareInteractionsForAdmin,
  fetchShepherdCareDirectoryForAdmin,
  type ActiveShepherdCoverageAssignmentSummary,
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

// The Leader-care (shepherd-care) surface's data, as a function of the reads
// seam (ADR 0015). The assembly has a real waterfall — the directory read is
// sequenced after the metric-defaults and coverage reads because it needs the
// resolved stale-contact windows and the active-coverage set — plus the
// availability flags that keep a transient read failure from reading as a real
// "0 unassigned". All of that is now testable through an in-memory adapter.

export type ShepherdCareLoadedData = {
  entries: ShepherdCareDirectoryEntry[];
  overShepherds: OverShepherdListRow[];
  assignments: ActiveShepherdCoverageAssignmentSummary[];
  assignmentsAvailable: boolean;
  recentInteractions: ShepherdCareRecentInteractionRow[];
  recentInteractionsAvailable: boolean;
  careFollowUps: CareFollowUpDashboardRow[];
  careFollowUpsAvailable: boolean;
  windows: CareCadenceWindows;
  error: string | null;
};

export type ShepherdCareReads = {
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
  fetchMetricDefaults: OmitClient<typeof fetchMetricDefaultsCached>;
  fetchShepherdCareDirectory: OmitClient<
    typeof fetchShepherdCareDirectoryForAdmin
  >;
};

export function supabaseShepherdCareReads(
  client: AppSupabaseClient
): ShepherdCareReads {
  return bindReads(client, {
    fetchOverShepherds: fetchOverShepherdsForAdmin,
    fetchActiveCoverageAssignments:
      fetchActiveShepherdCoverageAssignmentsForAdmin,
    fetchRecentInteractions: fetchRecentShepherdCareInteractionsForAdmin,
    fetchOutstandingCareFollowUps: fetchOutstandingCareFollowUpsForAdmin,
    fetchMetricDefaults: fetchMetricDefaultsCached,
    fetchShepherdCareDirectory: fetchShepherdCareDirectoryForAdmin,
  });
}

export async function buildShepherdCareData(
  reads: ShepherdCareReads,
  options: { todayIso: string }
): Promise<ShepherdCareLoadedData> {
  const todayIso = options.todayIso;

  // Resolve the configured per-tier stale-contact windows so the directory read
  // flags needs_attention against the same thresholds the dashboard later uses.
  // A missing/failed settings read falls back to the documented 30 / 60 baseline
  // via decodeMetricDefaults(null). None of these independent reads depend on
  // `windows`, so the defaults read joins the batch instead of gating it on its
  // own round trip; the directory (which does need the windows + the active
  // coverage set) stays sequenced after.
  //
  // Build the directory from the SAME active-coverage set the dashboard uses, so
  // its needs_attention can never disagree with the attention queue (Codex
  // review on #138). When the assignments read fails, the set is left undefined
  // and the directory falls back to the conservative longer (delegated) window —
  // consistent with the dashboard, which suppresses coverage-derived signals via
  // assignmentsAvailable=false below. The directory read receives the same
  // todayIso the page later uses for the dashboard model so a request straddling
  // UTC midnight can't produce a directory and a dashboard built off different
  // calendar days.
  const [
    overShepherdsRes,
    assignmentsRes,
    recentRes,
    followUpsRes,
    metricDefaultsRes,
  ] = await Promise.all([
    reads.fetchOverShepherds({ includeArchived: true }),
    reads.fetchActiveCoverageAssignments(),
    reads.fetchRecentInteractions({ limit: 10 }),
    reads.fetchOutstandingCareFollowUps(),
    reads.fetchMetricDefaults(),
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
  if (directory.error) {
    return {
      entries: [],
      overShepherds: [],
      assignments: [],
      assignmentsAvailable: false,
      recentInteractions: [],
      recentInteractionsAvailable: false,
      careFollowUps: [],
      careFollowUpsAvailable: false,
      windows,
      error: directory.error.message,
    };
  }
  // If the assignments or recent-interactions reads fail, mark each path as
  // unavailable so the dashboard renders an explicit "data unavailable" state
  // rather than silently falling back to "0 unassigned" or "no interactions
  // logged yet" during a transient DB error.
  const assignmentsAvailable = assignmentsRes.error === null;
  const recentInteractionsAvailable = recentRes.error === null;
  const careFollowUpsAvailable = followUpsRes.error === null;
  return {
    entries: directory.data,
    overShepherds: overShepherdsRes.data ?? [],
    assignments: assignmentsRes.data ?? [],
    assignmentsAvailable,
    recentInteractions: recentRes.data ?? [],
    recentInteractionsAvailable,
    careFollowUps: followUpsRes.data ?? [],
    careFollowUpsAvailable,
    windows,
    error:
      overShepherdsRes.error?.message ??
      assignmentsRes.error?.message ??
      recentRes.error?.message ??
      followUpsRes.error?.message ??
      null,
  };
}

export async function loadShepherdCareData(
  todayIso: string
): Promise<ShepherdCareLoadedData> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      entries: [],
      overShepherds: [],
      assignments: [],
      assignmentsAvailable: false,
      recentInteractions: [],
      recentInteractionsAvailable: false,
      careFollowUps: [],
      careFollowUpsAvailable: false,
      windows: careCadenceWindowsFromDefaults(decodeMetricDefaults(null)),
      error: "Database is not configured in this environment.",
    };
  }
  return buildShepherdCareData(supabaseShepherdCareReads(client), { todayIso });
}
