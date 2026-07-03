import type { GroupLeadersRow, GroupsRow } from "@/types/database";
import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// Column allowlist for the full-row groups fetchers (#495). These are the
// high-fan-out admin reads that return GroupsRow, so the list names every
// GroupsRow column — same data as before, but a future groups column (which
// could be sensitive, like admin_notes was) no longer flows to every caller
// by default. Typed against GroupsRow so a renamed/removed column fails
// typecheck; a pinning test freezes the exact set so widening this read must
// be a deliberate diff. Leader routes must keep using LEADER_SAFE_GROUP_COLUMNS.
export const GROUP_COLUMNS = columns<GroupsRow>()(
  "id",
  "name",
  "description",
  "meeting_day",
  "meeting_time",
  "meeting_frequency",
  "meeting_week_parity",
  "location_area",
  "address_optional",
  "capacity",
  "lifecycle_status",
  "health_status",
  "group_type",
  "launched_on",
  "pause_reason",
  "pause_start_date",
  "expected_return_date",
  "restart_reminder_date",
  "admin_notes",
  "created_at",
  "updated_at",
  "closed_at"
);

export async function fetchAllGroups(
  client: ReadClient
): Promise<ReadResult<GroupsRow[]>> {
  const { data, error } = await client
    .from("groups")
    .select(GROUP_COLUMNS.select)
    .order("name", { ascending: true })
    .returns<GroupsRow[]>();
  if (error) return { data: null, error: wrapError("fetchAllGroups", error) };
  return { data: data ?? [], error: null };
}

// A group reference is the id, name, lifecycle status, and the group's free-text
// type — enough to list active groups (e.g. a candidate/apprentice picker) and
// bucket them by type, without pulling the full row's privacy-sensitive columns
// (e.g. admin_notes). Prefer this over fetchAllGroups on read paths that only
// need to identify active groups.
export type GroupRef = Pick<
  GroupsRow,
  "id" | "name" | "lifecycle_status" | "group_type"
>;

export async function fetchGroupRefs(
  client: ReadClient
): Promise<ReadResult<GroupRef[]>> {
  const { data, error } = await client
    .from("groups")
    .select("id, name, lifecycle_status, group_type")
    .order("name", { ascending: true });
  if (error) return { data: null, error: wrapError("fetchGroupRefs", error) };
  return { data: (data ?? []) as GroupRef[], error: null };
}

export async function fetchGroupsByIds(
  client: ReadClient,
  ids: string[]
): Promise<ReadResult<GroupsRow[]>> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await client
    .from("groups")
    .select(GROUP_COLUMNS.select)
    .in("id", ids)
    .order("name", { ascending: true })
    .returns<GroupsRow[]>();
  if (error) return { data: null, error: wrapError("fetchGroupsByIds", error) };
  return { data: data ?? [], error: null };
}

// Leader-safe group read: an ALLOWLISTED projection that excludes admin-only
// columns (notably `admin_notes`, see AGENTS.md — admin notes must never reach a
// leader route). The leader surfaces (dashboard, care, calendar) read their own
// groups via the group RLS `auth_is_leader_of(id)` arm, so a full-GroupsRow
// read (fetchGroupsByIds via GROUP_COLUMNS) would pull admin_notes into a
// leader context. Leaders only ever need identity + schedule, so this returns
// exactly those columns.
export type LeaderSafeGroupRow = Pick<
  GroupsRow,
  | "id"
  | "name"
  | "lifecycle_status"
  | "meeting_day"
  | "meeting_time"
  | "meeting_frequency"
  | "meeting_week_parity"
>;

const LEADER_SAFE_GROUP_COLUMNS =
  "id, name, lifecycle_status, meeting_day, meeting_time, meeting_frequency, meeting_week_parity";

export async function fetchLeaderGroupsByIds(
  client: ReadClient,
  ids: string[]
): Promise<ReadResult<LeaderSafeGroupRow[]>> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await client
    .from("groups")
    .select(LEADER_SAFE_GROUP_COLUMNS)
    .in("id", ids)
    .order("name", { ascending: true });
  if (error)
    return { data: null, error: wrapError("fetchLeaderGroupsByIds", error) };
  return { data: (data ?? []) as LeaderSafeGroupRow[], error: null };
}

export async function fetchActiveGroupCount(
  client: ReadClient
): Promise<ReadResult<number>> {
  const { count, error } = await client
    .from("groups")
    .select("id", { count: "exact", head: true })
    .eq("lifecycle_status", "active");
  if (error)
    return { data: null, error: wrapError("fetchActiveGroupCount", error) };
  return { data: count ?? 0, error: null };
}

export async function fetchAssignedGroupIdsForProfile(
  client: ReadClient,
  profileId: string
): Promise<ReadResult<string[]>> {
  const { data, error } = await client
    .from("group_leaders")
    .select("group_id")
    .eq("profile_id", profileId)
    .eq("active", true)
    .returns<Pick<GroupLeadersRow, "group_id">[]>();
  if (error)
    return {
      data: null,
      error: wrapError("fetchAssignedGroupIdsForProfile", error),
    };
  return { data: (data ?? []).map((row) => row.group_id), error: null };
}

// Column allowlist for the group-leader assignment read (#495); every
// GroupLeadersRow column, pinned by a colocated test.
export const GROUP_LEADER_COLUMNS = columns<GroupLeadersRow>()(
  "id",
  "group_id",
  "profile_id",
  "role",
  "assigned_at",
  "active",
  "created_at"
);

export async function fetchAllGroupLeaders(
  client: ReadClient,
  options: { activeOnly?: boolean } = {}
): Promise<ReadResult<GroupLeadersRow[]>> {
  let query = client.from("group_leaders").select(GROUP_LEADER_COLUMNS.select);
  if (options.activeOnly) query = query.eq("active", true);
  const { data, error } = await query.returns<GroupLeadersRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchAllGroupLeaders", error) };
  return { data: data ?? [], error: null };
}
