import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import {
  PeopleManagementShell,
  type PeopleManagementData,
  type PeoplePipelineData,
} from "@/components/admin/people-management-shell";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  currentUtcDateIso,
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchAllGroupLeaders,
  fetchAllGroups,
  fetchAllMembers,
  fetchActiveMemberships,
  fetchLeaderPipelineForAdmin,
  fetchProfilesForAdmin,
  fetchShepherdCareDirectoryForAdmin,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import {
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import {
  buildPipelineRollup,
  type ApprenticeView,
  type PipelineGroupRef,
  type PipelineRollup,
} from "@/lib/admin/leader-pipeline";

export const dynamic = "force-dynamic";

const EMPTY_DATA = (currentActorProfileId: string): PeopleManagementData => ({
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

async function loadData(
  currentActorProfileId: string
): Promise<PeopleManagementData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_DATA(currentActorProfileId);

  const [
    profilesResult,
    membersResult,
    groupsResult,
    leadersResult,
    membershipsResult,
  ] = await Promise.all([
    fetchProfilesForAdmin(client, { statuses: ["active", "inactive"] }),
    fetchAllMembers(client, { statuses: ["active", "inactive"] }),
    fetchAllGroups(client),
    fetchAllGroupLeaders(client, { activeOnly: true }),
    fetchActiveMemberships(client),
  ]);

  return {
    currentActorProfileId,
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
// /admin/leader-pipeline route shows. Loading the rollup here is an
// entry-point change only — Planning still reads the pipeline as launch
// staffing supply through its own loader (ADR 0008/0009), unchanged.
async function loadPipeline(): Promise<PeoplePipelineData> {
  const empty: PipelineRollup = {
    stages: [],
    groupsWithoutApprentice: [],
    totalApprentices: 0,
  };
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      rollup: empty,
      availableGroups: [],
      error: "Database is not configured in this environment.",
    };
  }

  const [pipelineRes, allGroupsRes] = await Promise.all([
    fetchLeaderPipelineForAdmin(client),
    fetchAllGroups(client),
  ]);

  const activeGroups: PipelineGroupRef[] = (allGroupsRes.data ?? [])
    .filter((g) => g.lifecycle_status === "active")
    .map((g) => ({ id: g.id, name: g.name }));

  const apprentices: ApprenticeView[] = (pipelineRes.data ?? []).map((e) => ({
    id: e.apprentice.id,
    groupId: e.apprentice.group_id,
    groupName: e.groupName ?? "Unknown group",
    displayName: e.apprentice.display_name,
    memberId: e.apprentice.member_id,
    stage: e.apprentice.readiness_stage,
    expectedReadyOn: e.apprentice.expected_ready_on,
    notes: e.apprentice.notes,
  }));

  const rollup = buildPipelineRollup(apprentices, activeGroups);
  const availableGroups = [...activeGroups].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return {
    rollup,
    availableGroups,
    error: pipelineRes.error?.message ?? allGroupsRes.error?.message ?? null,
  };
}

// The set of leaders/co-leaders whose care cadence has lapsed, so each person
// row can show the Contact/Care indicator. Built from the same shepherd-care
// directory + active-coverage windows the Care area uses, so the two never
// disagree. On any read failure the set is simply empty (rows fall back to "No
// current concerns") — the indicator is glanceable context, not a gate.
async function loadNeedsContact(todayIso: string): Promise<Set<string>> {
  const client = await createSupabaseServerClient();
  if (!client) return new Set();

  const [assignmentsRes, metricDefaultsRes] = await Promise.all([
    fetchActiveShepherdCoverageAssignmentsForAdmin(client),
    fetchMetricDefaultsCached(client),
  ]);

  const windows = careCadenceWindowsFromDefaults(
    decodeMetricDefaults(metricDefaultsRes.data ?? null)
  );
  const delegatedShepherdIds = assignmentsRes.error
    ? undefined
    : new Set((assignmentsRes.data ?? []).map((a) => a.shepherd_profile_id));

  const directory = await fetchShepherdCareDirectoryForAdmin(client, {
    todayIso,
    windows,
    delegatedShepherdIds,
  });
  if (directory.error || !directory.data) return new Set();

  return new Set(
    directory.data.filter((e) => e.needs_attention).map((e) => e.profile.id)
  );
}

export default async function AdminPeoplePage() {
  const session = await requireAdmin();
  const today = currentUtcDateIso();

  const [data, pipeline, needsContactProfileIds] = await Promise.all([
    loadData(session.profile.id),
    loadPipeline(),
    loadNeedsContact(today),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="People"
        italic="& apprentices"
        lede="Everyone involved and how they relate to groups — the directory, leaders, members, and the apprentice pipeline."
      />
      <PageBody>
        <PeopleManagementShell
          data={data}
          pipeline={pipeline}
          needsContactProfileIds={needsContactProfileIds}
        />
      </PageBody>
    </>
  );
}
