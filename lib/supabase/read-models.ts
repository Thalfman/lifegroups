import type { ReadClient } from "./client";
import type {
  AttendanceRecordsRow,
  AttendanceSessionsRow,
  FollowUpsRow,
  GroupHealthUpdatesRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupsRow,
  GuestsRow,
  MembersRow,
} from "@/types/database";
import type { GuestPipelineStage } from "@/types/enums";

export type ReadResult<T> = { data: T; error: null } | { data: null; error: Error };

function wrapError(prefix: string, err: unknown): Error {
  if (err instanceof Error) return new Error(`${prefix}: ${err.message}`);
  return new Error(`${prefix}: ${String(err)}`);
}

export async function fetchAllGroups(client: ReadClient): Promise<ReadResult<GroupsRow[]>> {
  const { data, error } = await client
    .from("groups")
    .select("*")
    .order("name", { ascending: true });
  if (error) return { data: null, error: wrapError("fetchAllGroups", error) };
  return { data: data ?? [], error: null };
}

export async function fetchActiveGroupCount(client: ReadClient): Promise<ReadResult<number>> {
  const { count, error } = await client
    .from("groups")
    .select("id", { count: "exact", head: true })
    .eq("lifecycle_status", "active");
  if (error) return { data: null, error: wrapError("fetchActiveGroupCount", error) };
  return { data: count ?? 0, error: null };
}

export async function fetchAttendanceSessions(
  client: ReadClient,
  options: { groupId?: string; meetingWeek?: string; limit?: number } = {},
): Promise<ReadResult<AttendanceSessionsRow[]>> {
  let query = client
    .from("attendance_sessions")
    .select("*")
    .order("meeting_week", { ascending: false });
  if (options.groupId) query = query.eq("group_id", options.groupId);
  if (options.meetingWeek) query = query.eq("meeting_week", options.meetingWeek);
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) return { data: null, error: wrapError("fetchAttendanceSessions", error) };
  return { data: data ?? [], error: null };
}

export async function fetchLatestMeetingWeek(client: ReadClient): Promise<ReadResult<string | null>> {
  const { data, error } = await client
    .from("attendance_sessions")
    .select("meeting_week")
    .order("meeting_week", { ascending: false })
    .limit(1)
    .returns<{ meeting_week: string }[]>();
  if (error) return { data: null, error: wrapError("fetchLatestMeetingWeek", error) };
  if (!data || data.length === 0) return { data: null, error: null };
  return { data: data[0].meeting_week, error: null };
}

export async function fetchAttendanceRecordsForSessions(
  client: ReadClient,
  sessionIds: string[],
): Promise<ReadResult<AttendanceRecordsRow[]>> {
  if (sessionIds.length === 0) return { data: [], error: null };
  const { data, error } = await client
    .from("attendance_records")
    .select("*")
    .in("session_id", sessionIds);
  if (error) return { data: null, error: wrapError("fetchAttendanceRecordsForSessions", error) };
  return { data: data ?? [], error: null };
}

// Supabase REST responses default-cap rows at ~1000. Free-tier dashboards stay well
// below this, but we widen the cap with an explicit range so pipeline counts stop
// silently truncating once a project crosses the default. Beyond ~10k guests this
// should switch to per-stage `count: exact` queries instead of row reads.
const GUEST_PAGE_LIMIT = 10000;

export async function fetchGuests(client: ReadClient): Promise<ReadResult<GuestsRow[]>> {
  const { data, error } = await client
    .from("guests")
    .select("*")
    .order("created_at", { ascending: false })
    .range(0, GUEST_PAGE_LIMIT - 1);
  if (error) return { data: null, error: wrapError("fetchGuests", error) };
  return { data: data ?? [], error: null };
}

export async function fetchOpenFollowUps(
  client: ReadClient,
  options: { groupId?: string; limit?: number } = {},
): Promise<ReadResult<FollowUpsRow[]>> {
  let query = client
    .from("follow_ups")
    .select("*")
    .in("status", ["open", "in_progress"])
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false });
  if (options.groupId) query = query.eq("related_group_id", options.groupId);
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) return { data: null, error: wrapError("fetchOpenFollowUps", error) };
  return { data: data ?? [], error: null };
}

export async function fetchLatestHealthUpdates(
  client: ReadClient,
  options: { groupId?: string } = {},
): Promise<ReadResult<GroupHealthUpdatesRow[]>> {
  let query = client
    .from("group_health_updates")
    .select("*")
    .order("update_week", { ascending: false });
  if (options.groupId) query = query.eq("group_id", options.groupId);
  const { data, error } = await query;
  if (error) return { data: null, error: wrapError("fetchLatestHealthUpdates", error) };
  return { data: data ?? [], error: null };
}

export async function fetchActiveMemberships(
  client: ReadClient,
  options: { groupId?: string } = {},
): Promise<ReadResult<GroupMembershipsRow[]>> {
  let query = client
    .from("group_memberships")
    .select("*")
    .eq("status", "active");
  if (options.groupId) query = query.eq("group_id", options.groupId);
  const { data, error } = await query;
  if (error) return { data: null, error: wrapError("fetchActiveMemberships", error) };
  return { data: data ?? [], error: null };
}

export async function fetchMembersByIds(
  client: ReadClient,
  ids: string[],
): Promise<ReadResult<MembersRow[]>> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await client.from("members").select("*").in("id", ids);
  if (error) return { data: null, error: wrapError("fetchMembersByIds", error) };
  return { data: data ?? [], error: null };
}

export async function fetchFirstAssignedGroupForAnyLeader(
  client: ReadClient,
): Promise<ReadResult<{ groupId: string } | null>> {
  const { data, error } = await client
    .from("group_leaders")
    .select("*")
    .eq("active", true)
    .order("assigned_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .returns<GroupLeadersRow[]>();
  if (error) return { data: null, error: wrapError("fetchFirstAssignedGroupForAnyLeader", error) };
  if (!data || data.length === 0) return { data: null, error: null };
  return { data: { groupId: data[0].group_id }, error: null };
}

export async function fetchNewGuestsForGroupSince(
  client: ReadClient,
  groupId: string,
  sinceIsoDate: string,
): Promise<ReadResult<GuestsRow[]>> {
  const { data, error } = await client
    .from("guests")
    .select("*")
    .or(`first_attended_group_id.eq.${groupId},assigned_group_id.eq.${groupId}`)
    .gte("first_attended_date", sinceIsoDate);
  if (error) return { data: null, error: wrapError("fetchNewGuestsForGroupSince", error) };
  return { data: data ?? [], error: null };
}

export const GUEST_PIPELINE_STAGES: GuestPipelineStage[] = [
  "new",
  "contacted",
  "interested",
  "assigned",
  "attended",
  "placed",
  "not_now",
];
