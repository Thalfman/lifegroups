import type {
  PeopleManagementData,
  PeoplePipelineData,
} from "@/components/admin/people-management-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchActiveMemberships,
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchAllGroupLeaders,
  fetchAllGroups,
  fetchAllMembers,
  fetchLeaderPipelineForAdmin,
  fetchProfilesForAdmin,
  fetchShepherdCareDirectoryForAdmin,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import {
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import type { PipelineRollup } from "@/lib/admin/leader-pipeline";
import { buildLeaderPipelineData } from "@/components/admin/leader-pipeline/leader-pipeline-data";

// The People surface's three data sets — the directory, the apprentice
// pipeline rollup, and the per-leader needs-contact set — as functions of one
// reads seam (ADR 0015). Previously each was its own page-local loader that
// opened its own client; they now share a single adapter and are each testable
// through an in-memory adapter.

export type PeopleReads = {
  fetchProfilesForAdmin: OmitClient<typeof fetchProfilesForAdmin>;
  fetchAllMembers: OmitClient<typeof fetchAllMembers>;
  fetchAllGroups: OmitClient<typeof fetchAllGroups>;
  fetchAllGroupLeaders: OmitClient<typeof fetchAllGroupLeaders>;
  fetchActiveMemberships: OmitClient<typeof fetchActiveMemberships>;
  fetchLeaderPipeline: OmitClient<typeof fetchLeaderPipelineForAdmin>;
  fetchActiveCoverageAssignments: OmitClient<
    typeof fetchActiveShepherdCoverageAssignmentsForAdmin
  >;
  fetchMetricDefaults: OmitClient<typeof fetchMetricDefaultsCached>;
  fetchShepherdCareDirectory: OmitClient<
    typeof fetchShepherdCareDirectoryForAdmin
  >;
};

export function supabasePeopleReads(client: AppSupabaseClient): PeopleReads {
  return bindReads(client, {
    fetchProfilesForAdmin,
    fetchAllMembers,
    fetchAllGroups,
    fetchAllGroupLeaders,
    fetchActiveMemberships,
    fetchLeaderPipeline: fetchLeaderPipelineForAdmin,
    fetchActiveCoverageAssignments:
      fetchActiveShepherdCoverageAssignmentsForAdmin,
    fetchMetricDefaults: fetchMetricDefaultsCached,
    fetchShepherdCareDirectory: fetchShepherdCareDirectoryForAdmin,
  });
}

const EMPTY_DIRECTORY = (
  currentActorProfileId: string
): PeopleManagementData => ({
  currentActorProfileId,
  profiles: [],
  members: [],
  groups: [],
  groupLeaders: [],
  memberships: [],
  errors: {
    profiles: null,
    members: null,
    groups: null,
    leaders: null,
    memberships: null,
  },
});

export async function buildPeopleDirectoryData(
  reads: PeopleReads,
  options: { currentActorProfileId: string }
): Promise<PeopleManagementData> {
  const [
    profilesResult,
    membersResult,
    groupsResult,
    leadersResult,
    membershipsResult,
  ] = await Promise.all([
    reads.fetchProfilesForAdmin({ statuses: ["active", "inactive"] }),
    reads.fetchAllMembers({ statuses: ["active", "inactive"] }),
    reads.fetchAllGroups(),
    reads.fetchAllGroupLeaders({ activeOnly: true }),
    reads.fetchActiveMemberships(),
  ]);

  return {
    currentActorProfileId: options.currentActorProfileId,
    profiles: profilesResult.data ?? [],
    members: membersResult.data ?? [],
    groups: groupsResult.data ?? [],
    groupLeaders: leadersResult.data ?? [],
    memberships: membershipsResult.data ?? [],
    errors: {
      profiles: profilesResult.error?.message ?? null,
      members: membersResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
      leaders: leadersResult.error?.message ?? null,
      memberships: membershipsResult.error?.message ?? null,
    },
  };
}

// The Apprentices tab renders the same leader pipeline the frozen
// /admin/leader-pipeline route shows, so it reuses the one shared pipeline
// builder (ADR 0011 — extract genuinely duplicated rules). `PeopleReads` is a
// superset of `LeaderPipelineReads`, so it satisfies the shared builder
// directly. Planning still reads the pipeline as launch staffing supply through
// its own loader (ADR 0008/0009), unchanged.
export async function buildPeoplePipelineData(
  reads: PeopleReads
): Promise<PeoplePipelineData> {
  return buildLeaderPipelineData(reads);
}

// The set of leaders/co-leaders whose care cadence has lapsed, so each person
// row can show the Contact/Care indicator. Built from the same shepherd-care
// directory + active-coverage windows the Care area uses, so the two never
// disagree. On any read failure the set is simply empty (rows fall back to "No
// current concerns") — the indicator is glanceable context, not a gate.
export async function buildPeopleNeedsContact(
  reads: PeopleReads,
  options: { todayIso: string }
): Promise<Set<string>> {
  const [assignmentsRes, metricDefaultsRes] = await Promise.all([
    reads.fetchActiveCoverageAssignments(),
    reads.fetchMetricDefaults(),
  ]);

  const windows = careCadenceWindowsFromDefaults(
    decodeMetricDefaults(metricDefaultsRes.data ?? null)
  );
  const delegatedShepherdIds = assignmentsRes.error
    ? undefined
    : new Set((assignmentsRes.data ?? []).map((a) => a.shepherd_profile_id));

  const directory = await reads.fetchShepherdCareDirectory({
    todayIso: options.todayIso,
    windows,
    delegatedShepherdIds,
  });
  if (directory.error || !directory.data) return new Set();

  return new Set(
    directory.data.filter((e) => e.needs_attention).map((e) => e.profile.id)
  );
}

export type PeoplePageData = {
  data: PeopleManagementData;
  pipeline: PeoplePipelineData;
  needsContactProfileIds: Set<string>;
};

export async function loadPeoplePageData(options: {
  currentActorProfileId: string;
  todayIso: string;
}): Promise<PeoplePageData> {
  const emptyPipeline: PipelineRollup = {
    stages: [],
    groupsWithoutApprentice: [],
    totalApprentices: 0,
  };
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      data: EMPTY_DIRECTORY(options.currentActorProfileId),
      pipeline: {
        rollup: emptyPipeline,
        availableGroups: [],
        error: "Database is not configured in this environment.",
      },
      needsContactProfileIds: new Set(),
    };
  }

  const reads = supabasePeopleReads(client);
  const [data, pipeline, needsContactProfileIds] = await Promise.all([
    buildPeopleDirectoryData(reads, {
      currentActorProfileId: options.currentActorProfileId,
    }),
    buildPeoplePipelineData(reads),
    buildPeopleNeedsContact(reads, { todayIso: options.todayIso }),
  ]);

  return { data, pipeline, needsContactProfileIds };
}
