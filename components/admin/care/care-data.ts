import { createSupabaseServerClient } from "@/lib/supabase/server";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { bindReads, type BoundReads } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchActiveShepherdCoverageAssignmentsForAdmin,
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
} from "@/lib/supabase/shepherd-care-reads";
import { fetchAllGroupLeaders } from "@/lib/supabase/group-reads";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import { fetchAttentionResetBaselines } from "@/lib/supabase/maintenance-reads";
import {
  EMPTY_ATTENTION_BASELINES,
  type AttentionBaselines,
} from "@/lib/admin/attention-reset";
import {
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import type { CareCadenceWindows } from "@/lib/admin/shepherd-care-cadence";
import { resolveCareNeedsContact } from "@/lib/admin/care-needs-contact";

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

// How many rows each capped activity read pulls for the Care surface.
const RECENT_INTERACTIONS_LIMIT = 30;
const COMPLETED_FOLLOW_UPS_LIMIT = 50;

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

const CARE_FETCHERS = {
  fetchOverShepherds: fetchOverShepherdsForAdmin,
  fetchActiveAssignments: fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchRecentInteractions: fetchRecentShepherdCareInteractionsForAdmin,
  fetchOutstandingFollowUps: fetchOutstandingCareFollowUpsForAdmin,
  fetchCompletedFollowUps: fetchRecentlyCompletedCareFollowUpsForAdmin,
  fetchMetricDefaults: fetchMetricDefaultsCached,
  fetchGroupLeaders: fetchAllGroupLeaders,
  fetchAttentionBaselines: fetchAttentionResetBaselines,
  fetchCareDirectory: fetchShepherdCareDirectoryForAdmin,
};

export type CareReads = BoundReads<typeof CARE_FETCHERS>;

// Production adapter: binds the live Supabase client to every read this surface
// needs.
export function supabaseCareReads(client: AppSupabaseClient): CareReads {
  return bindReads(client, CARE_FETCHERS, "care");
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

// Pure assembly: gather the independent reads in parallel with the shared Care
// needs-contact resolver (issue #636), which owns the windows + active-coverage
// + baselines + directory waterfall the three surfaces share. Care keeps the
// full directory entries it returns; People + person-detail derive their narrower
// shapes from the same resolver, so the "needs contact" indicator can never
// disagree across the three. Every degrade path is reachable from a test through
// an in-memory `reads` adapter.
export async function buildCareData(
  reads: CareReads,
  options: { todayIso: string }
): Promise<CareData> {
  const { todayIso } = options;

  // The directory waterfall (windows + coverage + baselines + directory) lives in
  // the shared resolver; the remaining reads are independent and join a parallel
  // batch. Both fire concurrently — the resolver starts its own internal batch
  // immediately — so this preserves today's read concurrency.
  const [
    [
      overShepherdsRes,
      recentRes,
      outstandingRes,
      completedRes,
      groupLeadersRes,
    ],
    careContact,
  ] = await Promise.all([
    Promise.all([
      reads.fetchOverShepherds({ includeArchived: true }),
      reads.fetchRecentInteractions({ limit: RECENT_INTERACTIONS_LIMIT }),
      reads.fetchOutstandingFollowUps(),
      reads.fetchCompletedFollowUps({ limit: COMPLETED_FOLLOW_UPS_LIMIT }),
      reads.fetchGroupLeaders({ activeOnly: true }),
    ]),
    resolveCareNeedsContact(
      {
        fetchActiveAssignments: reads.fetchActiveAssignments,
        fetchMetricDefaults: reads.fetchMetricDefaults,
        fetchAttentionBaselines: reads.fetchAttentionBaselines,
        fetchCareDirectory: reads.fetchCareDirectory,
      },
      { todayIso }
    ),
  ]);

  const {
    directory,
    windows,
    baselines,
    assignments,
    assignmentsAvailable,
    assignmentsError,
    metricDefaultsError,
  } = careContact;
  if (directory.error) return emptyCareData(directory.error.message);

  return {
    entries: directory.data,
    assignments,
    assignmentsAvailable,
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
      assignmentsError ??
      recentRes.error?.message ??
      outstandingRes.error?.message ??
      completedRes.error?.message ??
      metricDefaultsError ??
      groupLeadersRes.error?.message ??
      null,
  };
}

// Binds the live client (or returns the documented empty shape when the DB is
// not configured) and runs the pure assembly. The calling page is unchanged.
export async function loadCareData(todayIso: string): Promise<CareData> {
  return measureReadBundle("care_dashboard", async () => {
    const client = await createSupabaseServerClient();
    if (!client) {
      return emptyCareData("Database is not configured in this environment.");
    }
    return buildCareData(supabaseCareReads(client), { todayIso });
  });
}
