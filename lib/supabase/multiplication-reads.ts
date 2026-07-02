import type {
  GroupsRow,
  LeaderPipelineRow,
  MultiplicationCandidatesRow,
} from "@/types/database";
import type { LeaderReadinessStage } from "@/types/enums";
import { countActiveMembersByGroup } from "@/lib/admin/group-capacity-inputs";
import {
  columns,
  fetchByIds,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

const MULTIPLICATION_CANDIDATE_COLUMNS =
  "id, group_id, target_year, status, " +
  "shepherd_willing, needs_similar_stage, " +
  "enough_members, established_long_enough, co_shepherd_tenured, " +
  "notes, successor_designate, meeting_time, leader_pipeline_id, " +
  "manual_member_count, archived_at, " +
  "created_by, updated_by, created_at, updated_at";

export type MultiplicationCandidateGroup = Pick<
  GroupsRow,
  "id" | "name" | "group_type" | "launched_on" | "lifecycle_status"
>;

// Capacity & Multiplication #184: the linked apprentice's identity + stage,
// surfaced inline in the planner. Null when the candidate has no link.
export type MultiplicationCandidateApprentice = {
  id: string;
  displayName: string;
  stage: LeaderReadinessStage;
};

export type MultiplicationCandidateEntry = {
  candidate: MultiplicationCandidatesRow;
  group: MultiplicationCandidateGroup | null;
  activeMemberCount: number;
  // The linked leader_pipeline apprentice, or null when unlinked.
  linkedApprentice: MultiplicationCandidateApprentice | null;
};

// Group projection read for the multiplication planner's batched group facts.
type MultiplicationGroupProjection = {
  id: string;
  group_type: string | null;
  launched_on: string | null;
  lifecycle_status: GroupsRow["lifecycle_status"];
  name: string;
};

// Return the first non-null read error from a set of batched reads, wrapped
// with its scope, or null when every read succeeded. Collapses the repetitive
// per-read error guards in `fetchMultiplicationCandidatesForAdmin`.
function firstReadError(
  results: ReadonlyArray<{ scope: string; error: unknown }>
): Error | null {
  for (const r of results) {
    if (r.error) return wrapError(r.scope, r.error);
  }
  return null;
}

function indexApprentices(
  rows: ReadonlyArray<{
    id: string;
    display_name: string;
    readiness_stage: LeaderReadinessStage;
  }>
): Map<string, MultiplicationCandidateApprentice> {
  const m = new Map<string, MultiplicationCandidateApprentice>();
  for (const a of rows) {
    m.set(a.id, {
      id: a.id,
      displayName: a.display_name,
      stage: a.readiness_stage,
    });
  }
  return m;
}

function indexCandidateGroups(
  groupRows: ReadonlyArray<MultiplicationGroupProjection>
): Map<string, MultiplicationCandidateGroup> {
  const m = new Map<string, MultiplicationCandidateGroup>();
  for (const g of groupRows) {
    m.set(g.id, {
      id: g.id,
      name: g.name,
      group_type: g.group_type,
      launched_on: g.launched_on,
      lifecycle_status: g.lifecycle_status,
    });
  }
  return m;
}

// Julian P4: active (non-archived) multiplication candidates enriched with the
// group facts the planner surface needs (member count for the summary line).
// ADR 0029: readiness is now read from the candidate's stored flags, so no
// launch date / co-shepherd tenure is fetched. Admin-only via RLS. Batches the
// group/membership reads by the candidates' group ids to avoid N+1.
export async function fetchMultiplicationCandidatesForAdmin(
  client: ReadClient
): Promise<ReadResult<MultiplicationCandidateEntry[]>> {
  const candidatesRes = await client
    .from("multiplication_candidates")
    .select(MULTIPLICATION_CANDIDATE_COLUMNS)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (candidatesRes.error) {
    return {
      data: null,
      error: wrapError(
        "fetchMultiplicationCandidatesForAdmin/candidates",
        candidatesRes.error
      ),
    };
  }
  const candidates = (candidatesRes.data ??
    []) as MultiplicationCandidatesRow[];
  if (candidates.length === 0) return { data: [], error: null };

  // Type-first: a candidate may have no group (type-only watch), so filter null
  // group ids out before the batched group/membership/leader reads.
  const groupIds = [
    ...new Set(
      candidates.map((c) => c.group_id).filter((id): id is string => id != null)
    ),
  ];
  const apprenticeIds = [
    ...new Set(
      candidates
        .map((c) => c.leader_pipeline_id)
        .filter((id): id is string => id != null)
    ),
  ];

  // When every candidate is a type-only watch, groupIds is empty. Short-circuit
  // the group-keyed reads (an empty `.in("id", [])` is the edge other read paths
  // here avoid) so a valid all-type-only pipeline still renders.
  const noGroups = groupIds.length === 0;
  const [groupsRes, membershipsRes, apprenticesRes] = await Promise.all([
    noGroups
      ? Promise.resolve({ data: [], error: null })
      : client
          .from("groups")
          .select("id, name, group_type, launched_on, lifecycle_status")
          .in("id", groupIds),
    noGroups
      ? Promise.resolve({ data: [], error: null })
      : client
          .from("group_memberships")
          .select("group_id, status")
          .in("group_id", groupIds)
          .eq("status", "active"),
    apprenticeIds.length > 0
      ? client
          .from("leader_pipeline")
          .select("id, display_name, readiness_stage")
          .in("id", apprenticeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  // The group + membership reads back the candidate's identity and member count,
  // so a failure there blanks the read. The linked-apprentice enrichment is
  // non-critical (the planner shows the name; the Multiply locked-in rows don't
  // render it at all), so a transient leader_pipeline read failure degrades
  // linkedApprentice to null (empty index below) rather than blanking every
  // candidate — reads degrade gracefully: a failed read suppresses derived
  // output, not the whole surface.
  const batchError = firstReadError([
    {
      scope: "fetchMultiplicationCandidatesForAdmin/groups",
      error: groupsRes.error,
    },
    {
      scope: "fetchMultiplicationCandidatesForAdmin/memberships",
      error: membershipsRes.error,
    },
  ]);
  if (batchError) return { data: null, error: batchError };

  const apprenticeById = indexApprentices(
    (apprenticesRes.data ?? []) as {
      id: string;
      display_name: string;
      readiness_stage: LeaderReadinessStage;
    }[]
  );

  // The planner buckets by the anchoring group's free-text group_type, read
  // directly off the group projection — no catalog round-trip needed.
  const groupRows = (groupsRes.data ?? []) as MultiplicationGroupProjection[];
  const groupById = indexCandidateGroups(groupRows);
  const memberCountByGroup = countActiveMembersByGroup(
    (membershipsRes.data ?? []) as {
      group_id: string;
      status: string | null;
    }[]
  );

  const entries: MultiplicationCandidateEntry[] = candidates.map(
    (candidate) => ({
      candidate,
      // Type-only candidates carry no group → group/member facts are absent
      // (group: null, 0 members).
      group: candidate.group_id
        ? (groupById.get(candidate.group_id) ?? null)
        : null,
      activeMemberCount: candidate.group_id
        ? (memberCountByGroup.get(candidate.group_id) ?? 0)
        : 0,
      linkedApprentice: candidate.leader_pipeline_id
        ? (apprenticeById.get(candidate.leader_pipeline_id) ?? null)
        : null,
    })
  );

  return { data: entries, error: null };
}

const LEADER_PIPELINE_COLUMNS =
  "id, group_id, display_name, member_id, readiness_stage, expected_ready_on, " +
  "notes, archived_at, created_by, updated_by, created_at, updated_at";

export type LeaderPipelineEntry = {
  apprentice: LeaderPipelineRow;
  // Group name for the apprentice's group, or null when the group is missing.
  groupName: string | null;
};

// Capacity & Multiplication #183: active (non-archived) apprentices enriched
// with their group name. Admin-only via RLS. Batches the group-name read by the
// apprentices' group ids to avoid N+1. Ordered by created_at so the roll-up is
// stable before the pure layer re-sorts within each stage.
export async function fetchLeaderPipelineForAdmin(
  client: ReadClient
): Promise<ReadResult<LeaderPipelineEntry[]>> {
  const pipelineRes = await client
    .from("leader_pipeline")
    .select(LEADER_PIPELINE_COLUMNS)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (pipelineRes.error) {
    return {
      data: null,
      error: wrapError(
        "fetchLeaderPipelineForAdmin/pipeline",
        pipelineRes.error
      ),
    };
  }
  const apprentices = (pipelineRes.data ?? []) as LeaderPipelineRow[];
  if (apprentices.length === 0) return { data: [], error: null };

  const groupsRes = await fetchByIds<{ id: string; name: string }>(
    client,
    "groups",
    apprentices.map((a) => a.group_id),
    "id, name",
    { label: "fetchLeaderPipelineForAdmin/groups" }
  );
  if (groupsRes.error) {
    return { data: null, error: groupsRes.error };
  }
  const nameById = new Map<string, string>();
  for (const g of groupsRes.data ?? []) {
    nameById.set(g.id, g.name);
  }

  const entries: LeaderPipelineEntry[] = apprentices.map((apprentice) => ({
    apprentice,
    groupName: nameById.get(apprentice.group_id) ?? null,
  }));
  return { data: entries, error: null };
}

// A lean apprentice reference for the multiplication candidate picker: only the
// identity, group, and stage used to build the same-group dropdown labels.
// Narrower than fetchLeaderPipelineForAdmin (which also reads notes / dates /
// member_id for the editable Leaders surface), so a Plan-only read path doesn't
// pull apprentice notes. Shaped as `{ apprentice }` so it slots into the same
// consumer (buildMultiplicationView) as the full pipeline entries.
export type ApprenticePickerRef = Pick<
  LeaderPipelineRow,
  "id" | "group_id" | "display_name" | "readiness_stage"
>;

export async function fetchApprenticePickerRefs(
  client: ReadClient
): Promise<ReadResult<{ apprentice: ApprenticePickerRef }[]>> {
  const { data, error } = await client
    .from("leader_pipeline")
    .select("id, group_id, display_name, readiness_stage")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    return { data: null, error: wrapError("fetchApprenticePickerRefs", error) };
  }
  const rows = (data ?? []) as ApprenticePickerRef[];
  return { data: rows.map((apprentice) => ({ apprentice })), error: null };
}

// Capacity & Multiplication #185: everything the Capacity Board + system
// suggestions need beyond the launch-planning inputs bundle — the apprentices
// per group (for the ready-to-multiply badge) and the candidate group ids (so
// suggestions can be de-duped against groups already in the plan). ADR 0029
// decision 3: the Board no longer annotates readiness, so co-shepherd tenure and
// the candidate readiness flags are no longer fetched. Group/override/membership/
// default data is fetched separately via fetchLaunchPlanningInputsForAdmin.
export type CapacityBoardExtras = {
  apprentices: {
    id: string;
    group_id: string;
    display_name: string;
    readiness_stage: LeaderReadinessStage;
  }[];
  candidateGroupIds: string[];
  // group id → free-text group_type, so the board's segment is the type name.
  // A group with no type is simply absent (= Untyped).
  groupTypeByGroup: Record<string, string>;
  error: string | null;
};

export async function fetchCapacityBoardExtras(
  client: ReadClient
): Promise<CapacityBoardExtras> {
  const empty: CapacityBoardExtras = {
    apprentices: [],
    candidateGroupIds: [],
    groupTypeByGroup: {},
    error: null,
  };

  const [apprenticesRes, candidatesRes, groupsRes] = await Promise.all([
    client
      .from("leader_pipeline")
      .select("id, group_id, display_name, readiness_stage")
      .is("archived_at", null),
    client
      .from("multiplication_candidates")
      .select("group_id")
      .is("archived_at", null),
    // Each group's free-text type, for the board's segment label.
    client.from("groups").select("id, group_type"),
  ]);

  const error =
    (apprenticesRes.error &&
      wrapError("fetchCapacityBoardExtras/apprentices", apprenticesRes.error)
        .message) ||
    (candidatesRes.error &&
      wrapError("fetchCapacityBoardExtras/candidates", candidatesRes.error)
        .message) ||
    (groupsRes.error &&
      wrapError("fetchCapacityBoardExtras/groups", groupsRes.error).message) ||
    null;
  if (error) return { ...empty, error };

  // Each group's free-text type drives the board segment label directly; an
  // absent entry reads as Untyped.
  const groupTypeByGroup: Record<string, string> = {};
  const groupRows = (groupsRes.data ?? []) as {
    id: string;
    group_type: string | null;
  }[];
  for (const g of groupRows) {
    const type = g.group_type?.trim();
    if (type) groupTypeByGroup[g.id] = type;
  }

  const candidateGroupIds: string[] = [];
  for (const c of (candidatesRes.data ?? []) as {
    group_id: string | null;
  }[]) {
    // Type-only candidates carry no group, so they don't count as "already a
    // candidate" on the capacity board.
    if (c.group_id == null) continue;
    candidateGroupIds.push(c.group_id);
  }

  return {
    apprentices: (apprenticesRes.data ??
      []) as CapacityBoardExtras["apprentices"],
    candidateGroupIds,
    groupTypeByGroup,
    error: null,
  };
}

// Readiness rule read model. One allowlisted read feeds the Settings readiness
// editor + Multiply: the single GLOBAL rule for the current ministry year. RLS
// restricts SELECT to admins — never select("*"). Per-type overrides live on
// group_type_configs (read via fetchGroupTypeConfigs). The rule's `rule` jsonb is
// decoded into a typed ReadinessRule at the trust boundary
// (lib/admin/cell-readiness.ts); the row type here stays raw.

// One persisted global-rule row, as read through the allowlist. The `rule` field
// is raw jsonb; the caller decodes it with decodeReadinessRule. The allowlist
// below is pinned to this type via `columns<…>()`.
export type ReadinessRuleRow = {
  id: string;
  ministry_year: number;
  rule: unknown;
  updated_at: string;
};

export const READINESS_RULE_COLUMNS = columns<ReadinessRuleRow>()(
  "id",
  "ministry_year",
  "rule",
  "updated_at"
);

// Fetch the global readiness rule for a ministry year (at most one row). A null
// result is the success-with-empty case — a fresh ministry has no rule until
// Julian sets one; the editor + evaluator fall back to the built-in rule.
export async function fetchReadinessRule(
  client: ReadClient,
  ministryYear: number
): Promise<ReadResult<ReadinessRuleRow | null>> {
  const { data, error } = await client
    .from("multiplication_readiness_rule")
    .select(READINESS_RULE_COLUMNS.select)
    .eq("ministry_year", ministryYear)
    .maybeSingle<ReadinessRuleRow>();

  if (error)
    return {
      data: null,
      error: wrapError("multiplication_readiness_rule", error),
    };
  return { data: data ?? null, error: null };
}
