import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchAllGroups,
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

export type LeaderPipelineData = {
  rollup: PipelineRollup;
  availableGroups: { id: string; name: string }[];
  error: string | null;
};

export type LeaderPipelineReads = {
  fetchLeaderPipeline: OmitClient<typeof fetchLeaderPipelineForAdmin>;
  fetchAllGroups: OmitClient<typeof fetchAllGroups>;
};

export function supabaseLeaderPipelineReads(
  client: AppSupabaseClient
): LeaderPipelineReads {
  return bindReads(client, {
    fetchLeaderPipeline: fetchLeaderPipelineForAdmin,
    fetchAllGroups,
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
  const [pipelineRes, allGroupsRes] = await Promise.all([
    reads.fetchLeaderPipeline(),
    reads.fetchAllGroups(),
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

export async function loadLeaderPipelineData(): Promise<LeaderPipelineData> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      rollup: EMPTY_ROLLUP,
      availableGroups: [],
      error: "Database is not configured in this environment.",
    };
  }
  return buildLeaderPipelineData(supabaseLeaderPipelineReads(client));
}
