import type {
  PeopleManagementData,
  PeoplePipelineData,
} from "@/components/admin/people-management-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type BoundReads } from "@/lib/supabase/reads-seam";
import { readBatch } from "@/lib/supabase/read-batch";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchShepherdCareDirectoryForAdmin,
} from "@/lib/supabase/shepherd-care-reads";
import {
  fetchAllGroupLeaders,
  fetchAllGroups,
  fetchGroupRefs,
} from "@/lib/supabase/group-reads";
import {
  fetchActiveMemberships,
  fetchAllMembers,
  fetchProfilesForAdmin,
} from "@/lib/supabase/membership-reads";
import { fetchLeaderPipelineForAdmin } from "@/lib/supabase/multiplication-reads";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import { fetchAttentionResetBaselines } from "@/lib/supabase/maintenance-reads";
import {
  needsContactProfileIds,
  resolveCareNeedsContact,
} from "@/lib/admin/care-needs-contact";
import type { PipelineRollup } from "@/lib/admin/leader-pipeline";
import { buildLeaderPipelineData } from "@/components/admin/leader-pipeline/leader-pipeline-data";

// The People surface's three data sets — the directory, the apprentice
// pipeline rollup, and the per-leader needs-contact set — as functions of one
// reads seam (ADR 0015). Previously each was its own page-local loader that
// opened its own client; they now share a single adapter and are each testable
// through an in-memory adapter.

const PEOPLE_FETCHERS = {
  fetchProfilesForAdmin,
  fetchAllMembers,
  fetchAllGroups,
  // Lean group projection for the shared leader-pipeline builder (which only
  // needs id/name/lifecycle); the directory keeps the full fetchAllGroups.
  fetchGroupRefs,
  fetchAllGroupLeaders,
  fetchActiveMemberships,
  fetchLeaderPipeline: fetchLeaderPipelineForAdmin,
  fetchActiveCoverageAssignments:
    fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchMetricDefaults: fetchMetricDefaultsCached,
  fetchAttentionBaselines: fetchAttentionResetBaselines,
  fetchShepherdCareDirectory: fetchShepherdCareDirectoryForAdmin,
};

export type PeopleReads = BoundReads<typeof PEOPLE_FETCHERS>;

export function supabasePeopleReads(client: AppSupabaseClient): PeopleReads {
  return bindReads(client, PEOPLE_FETCHERS, "people");
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
  const batch = await readBatch({
    profiles: () =>
      reads.fetchProfilesForAdmin({ statuses: ["active", "inactive"] }),
    members: () => reads.fetchAllMembers({ statuses: ["active", "inactive"] }),
    groups: () => reads.fetchAllGroups(),
    leaders: () => reads.fetchAllGroupLeaders({ activeOnly: true }),
    memberships: () => reads.fetchActiveMemberships(),
  });

  return {
    currentActorProfileId: options.currentActorProfileId,
    // super_admin is the platform owner, not a ministry participant — keep them
    // out of people-facing lists (directory + Leaders tab). Role-based per the
    // no-hardcoded-names rule. The Super Admin Console roster and role-change
    // form already exclude super_admin separately.
    profiles: (batch.results.profiles.data ?? []).filter(
      (p) => p.role !== "super_admin"
    ),
    members: batch.results.members.data ?? [],
    groups: batch.results.groups.data ?? [],
    groupLeaders: batch.results.leaders.data ?? [],
    memberships: batch.results.memberships.data ?? [],
    errors: batch.errors,
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
// row can show the Contact/Care indicator. Built through the shared Care
// needs-contact resolver (lib/admin/care-needs-contact.ts) — the same windows +
// active-coverage + "care" attention-reset baselines + directory waterfall the
// Care tab uses — so the People tab and Care answer "needs contact" identically.
// Passing the "care" baselines (which this surface used to omit) is the issue
// #636 fix: a Leader cleared by a care reset now drops off the People tab too. On
// any read failure the set is simply empty (rows fall back to "No current
// concerns") — the indicator is glanceable context, not a gate.
export async function buildPeopleNeedsContact(
  reads: PeopleReads,
  options: { todayIso: string }
): Promise<Set<string>> {
  const resolution = await resolveCareNeedsContact(
    {
      fetchActiveAssignments: reads.fetchActiveCoverageAssignments,
      fetchMetricDefaults: reads.fetchMetricDefaults,
      fetchAttentionBaselines: reads.fetchAttentionBaselines,
      fetchCareDirectory: reads.fetchShepherdCareDirectory,
    },
    { todayIso: options.todayIso }
  );
  return needsContactProfileIds(resolution);
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
        memberOptionsByGroup: {},
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
