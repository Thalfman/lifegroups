import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchActiveMemberships,
  fetchAllMembers,
  fetchGroupRefs,
  fetchLeaderPipelineForAdmin,
} from "@/lib/supabase/read-models";
import {
  buildPipelineRollup,
  type ApprenticeView,
  type PipelineGroupRef,
  type PipelineRollup,
} from "@/lib/admin/leader-pipeline";

// The leader pipeline rollup, as a function of the reads seam (ADR 0015). This
// is the single home for "read the pipeline + active groups, map to a rollup" —
// both the frozen /admin/leader-pipeline route and the People surface's
// Apprentices tab render the same data, so the mapping lives here once rather
// than copied per host (ADR 0011: extract genuinely duplicated rules).

// An active group member offered by the apprentice "link to a member"
// dropdown.
export type PipelineMemberOption = { id: string; name: string };

export type LeaderPipelineData = {
  rollup: PipelineRollup;
  availableGroups: { id: string; name: string }[];
  // Each active group's active members, for the apprentice member-link
  // dropdown. A group with no key has no linkable members; the form falls
  // back to its typed-name path.
  memberOptionsByGroup: Record<string, PipelineMemberOption[]>;
  error: string | null;
};

export type LeaderPipelineReads = {
  fetchLeaderPipeline: OmitClient<typeof fetchLeaderPipelineForAdmin>;
  // Lean id/name/lifecycle projection — the rollup only needs to identify active
  // groups, so we avoid pulling the full group row (e.g. admin_notes), which
  // matters now this loads on every Multiply visit via the Leaders tab.
  fetchGroupRefs: OmitClient<typeof fetchGroupRefs>;
  // Active memberships + active members feed the member-link dropdown. The
  // names match PeopleReads' fields so PeopleReads stays a structural superset.
  fetchActiveMemberships: OmitClient<typeof fetchActiveMemberships>;
  fetchAllMembers: OmitClient<typeof fetchAllMembers>;
};

export function supabaseLeaderPipelineReads(
  client: AppSupabaseClient
): LeaderPipelineReads {
  return bindReads(client, {
    fetchLeaderPipeline: fetchLeaderPipelineForAdmin,
    fetchGroupRefs,
    fetchActiveMemberships,
    fetchAllMembers,
  });
}

const EMPTY_ROLLUP: PipelineRollup = {
  stages: [],
  groupsWithoutApprentice: [],
  totalApprentices: 0,
};

export async function buildLeaderPipelineData(
  reads: LeaderPipelineReads
): Promise<LeaderPipelineData> {
  const [pipelineRes, groupRefsRes, membershipsRes, membersRes] =
    await Promise.all([
      reads.fetchLeaderPipeline(),
      reads.fetchGroupRefs(),
      reads.fetchActiveMemberships(),
      reads.fetchAllMembers({ statuses: ["active"] }),
    ]);

  const activeGroups: PipelineGroupRef[] = (groupRefsRes.data ?? [])
    .filter((g) => g.lifecycle_status === "active")
    .map((g) => ({ id: g.id, name: g.name }));

  // Active members per active group, for the member-link dropdown. A failed
  // options read degrades to no options — the add/edit forms fall back to the
  // typed-name path — rather than folding into `error`, which would blank the
  // whole pipeline.
  const memberOptionsByGroup: Record<string, PipelineMemberOption[]> = {};
  if (!membershipsRes.error && !membersRes.error) {
    const memberNameById = new Map(
      (membersRes.data ?? []).map((m) => [m.id, m.full_name])
    );
    const activeGroupIds = new Set(activeGroups.map((g) => g.id));
    for (const link of membershipsRes.data ?? []) {
      if (!activeGroupIds.has(link.group_id)) continue;
      const name = memberNameById.get(link.member_id);
      if (name === undefined) continue;
      (memberOptionsByGroup[link.group_id] ??= []).push({
        id: link.member_id,
        name,
      });
    }
    for (const options of Object.values(memberOptionsByGroup)) {
      options.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

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
    memberOptionsByGroup,
    error: pipelineRes.error?.message ?? groupRefsRes.error?.message ?? null,
  };
}

export async function loadLeaderPipelineData(): Promise<LeaderPipelineData> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      rollup: EMPTY_ROLLUP,
      availableGroups: [],
      memberOptionsByGroup: {},
      error: "Database is not configured in this environment.",
    };
  }
  return buildLeaderPipelineData(supabaseLeaderPipelineReads(client));
}
