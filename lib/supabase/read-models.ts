import type {
  AppSettingsRow,
  AttendanceRecordsRow,
  AttendanceSessionsRow,
  ChurchAttendanceSnapshotsRow,
  GroupCalendarEventsRow,
  GroupHealthAssessmentsRow,
  GroupHealthUpdatesRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  GroupTypeConfigsRow,
  GuestsRow,
  LaunchPlanningScenariosRow,
  LeaderPipelineRow,
  MembersRow,
  MultiplicationCandidatesRow,
  PlatformConfigRow,
  ProfilesRow,
} from "@/types/database";
import type {
  GuestPipelineStage,
  LeaderReadinessStage,
  MembershipStatus,
  ProfileStatus,
  UserRole,
} from "@/types/enums";
import { isUuid } from "@/lib/shared/uuid";
import { churchDayStartUtcIso } from "@/lib/shared/church-time";
import { countActiveMembersByGroup } from "@/lib/admin/group-capacity-inputs";
import {
  currentUtcDateIso,
  differenceInDaysIso,
  fetchByIds,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";
// fetchOpenFollowUps is a leader-safe dashboard reader that still lives here; it
// uses the follow-up column allowlist + row type that now live in follow-up-reads.
import {
  LEADER_FOLLOW_UP_COLUMNS,
  type LeaderFollowUpRow,
} from "./follow-up-reads";

// Shared low-level read primitives live in ./read-core so the shepherd-care
// slice and the rest of read-models can both use them without an import cycle.
// Re-exported here so existing importers of these names from read-models keep
// working unchanged.
export { currentUtcDateIso, differenceInDaysIso };
export type { ReadResult, ReadClient };

// The shepherd-care + over-shepherd/coverage read cluster lives in its own
// module. Re-exported wholesale so every name that used to be importable from
// read-models stays importable from here.
export * from "./shepherd-care-reads";

// The Care Note / Prayer Request reads (#381) and the follow-up reads (Phase
// 5C.0) live in their own focused modules. Re-exported wholesale so every name
// stays importable from read-models unchanged — this barrel is now a thinner
// re-export of focused read modules rather than their sole home.
export * from "./care-note-reads";
export * from "./follow-up-reads";

// Trust-boundary guards for settings rows. Validate the discriminating
// fields before letting a Supabase response be treated as the typed row;
// guard failures route through the same wrapError channel as PostgREST
// errors so callers don't need a new branch.

function isAppSettingsRow(v: unknown): v is AppSettingsRow {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.setting_key === "string" &&
    typeof r.setting_value === "object" &&
    r.setting_value !== null
  );
}

function isGroupMetricSettingsRow(v: unknown): v is GroupMetricSettingsRow {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  return isUuid((v as Record<string, unknown>).group_id);
}

// Column allowlist for the full-row groups fetchers (#495). These are the
// high-fan-out admin reads that return GroupsRow, so the list names every
// GroupsRow column — same data as before, but a future groups column (which
// could be sensitive, like admin_notes was) no longer flows to every caller
// by default. Typed against GroupsRow so a renamed/removed column fails
// typecheck; a pinning test freezes the exact set so widening this read must
// be a deliberate diff. Leader routes must keep using LEADER_SAFE_GROUP_COLUMNS.
export const GROUP_COLUMNS = [
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
  "closed_at",
] as const satisfies readonly (keyof GroupsRow)[];

const GROUP_SELECT = GROUP_COLUMNS.join(", ");

export async function fetchAllGroups(
  client: ReadClient
): Promise<ReadResult<GroupsRow[]>> {
  const { data, error } = await client
    .from("groups")
    .select(GROUP_SELECT)
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
    .select(GROUP_SELECT)
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

export type OverviewActivityCounts = {
  membersJoined: number;
  followUpsCompleted: number;
  careTouchpoints: number;
  prospectsAdded: number;
};

// Counts of dated activity within [fromIso, toExclusiveIso) for the executive
// overview's period band. `fromIso` null means all-time (upper bound only).
// Head-only count queries keep this cheap. Groups launched and guests welcomed
// are derived from arrays the dashboard already fetches, so they are NOT read
// here. Prospects added (#471) counts `prospects.created_at` — the live
// Interest Funnel intake, replacing the frozen-guests "Guests welcomed" tile.
// Archived Prospects still count: the tile measures intake activity in the
// period, not the funnel's current state.
//
// joined_at and interaction_at are DATE columns (church-local calendar days),
// so the YYYY-MM-DD bounds compare directly. completed_at and created_at are
// timestamptz, so their bounds are converted to the matching UTC instants of
// church-local midnight — otherwise a late-evening-local row (which Postgres
// reads as the next UTC day) would land in the wrong period.
export async function fetchOverviewActivityCounts(
  client: ReadClient,
  range: { fromIso: string | null; toExclusiveIso: string }
): Promise<ReadResult<OverviewActivityCounts>> {
  let membersQ = client
    .from("group_memberships")
    .select("id", { count: "exact", head: true })
    .lt("joined_at", range.toExclusiveIso);
  if (range.fromIso) membersQ = membersQ.gte("joined_at", range.fromIso);

  let followUpsQ = client
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .not("completed_at", "is", null)
    .lt("completed_at", churchDayStartUtcIso(range.toExclusiveIso));
  if (range.fromIso)
    followUpsQ = followUpsQ.gte(
      "completed_at",
      churchDayStartUtcIso(range.fromIso)
    );

  let interactionsQ = client
    .from("shepherd_care_interactions")
    .select("id", { count: "exact", head: true })
    .lt("interaction_at", range.toExclusiveIso);
  if (range.fromIso)
    interactionsQ = interactionsQ.gte("interaction_at", range.fromIso);

  let prospectsQ = client
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .lt("created_at", churchDayStartUtcIso(range.toExclusiveIso));
  if (range.fromIso)
    prospectsQ = prospectsQ.gte(
      "created_at",
      churchDayStartUtcIso(range.fromIso)
    );

  const [membersRes, followUpsRes, interactionsRes, prospectsRes] =
    await Promise.all([membersQ, followUpsQ, interactionsQ, prospectsQ]);

  const firstError =
    membersRes.error ||
    followUpsRes.error ||
    interactionsRes.error ||
    prospectsRes.error;
  if (firstError)
    return {
      data: null,
      error: wrapError("fetchOverviewActivityCounts", firstError),
    };

  return {
    data: {
      membersJoined: membersRes.count ?? 0,
      followUpsCompleted: followUpsRes.count ?? 0,
      careTouchpoints: interactionsRes.count ?? 0,
      prospectsAdded: prospectsRes.count ?? 0,
    },
    error: null,
  };
}

// Column allowlist for the attendance-session fetcher (#495); every
// AttendanceSessionsRow column (the admin review surfaces render both the
// leader_note and admin_note), pinned by a colocated test.
export const ATTENDANCE_SESSION_COLUMNS = [
  "id",
  "group_id",
  "meeting_week",
  "meeting_date",
  "status",
  "submitted_by",
  "submitted_at",
  "leader_note",
  "admin_note",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof AttendanceSessionsRow)[];

const ATTENDANCE_SESSION_SELECT = ATTENDANCE_SESSION_COLUMNS.join(", ");

export async function fetchAttendanceSessions(
  client: ReadClient,
  options: { groupId?: string; meetingWeek?: string; limit?: number } = {}
): Promise<ReadResult<AttendanceSessionsRow[]>> {
  let query = client
    .from("attendance_sessions")
    .select(ATTENDANCE_SESSION_SELECT)
    .order("meeting_week", { ascending: false });
  if (options.groupId) query = query.eq("group_id", options.groupId);
  if (options.meetingWeek)
    query = query.eq("meeting_week", options.meetingWeek);
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query.returns<AttendanceSessionsRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchAttendanceSessions", error) };
  return { data: data ?? [], error: null };
}

export async function fetchLatestMeetingWeek(
  client: ReadClient
): Promise<ReadResult<string | null>> {
  const { data, error } = await client
    .from("attendance_sessions")
    .select("meeting_week")
    .order("meeting_week", { ascending: false })
    .limit(1)
    .returns<{ meeting_week: string }[]>();
  if (error)
    return { data: null, error: wrapError("fetchLatestMeetingWeek", error) };
  if (!data || data.length === 0) return { data: null, error: null };
  return { data: data[0].meeting_week, error: null };
}

// Column allowlist for the attendance-record fetcher (#495); every
// AttendanceRecordsRow column, pinned by a colocated test.
export const ATTENDANCE_RECORD_COLUMNS = [
  "id",
  "session_id",
  "member_id",
  "attendance_status",
  "created_at",
] as const satisfies readonly (keyof AttendanceRecordsRow)[];

const ATTENDANCE_RECORD_SELECT = ATTENDANCE_RECORD_COLUMNS.join(", ");

export async function fetchAttendanceRecordsForSessions(
  client: ReadClient,
  sessionIds: string[]
): Promise<ReadResult<AttendanceRecordsRow[]>> {
  if (sessionIds.length === 0) return { data: [], error: null };
  // Widen past the PostgREST default 1000-row cap (see GUEST_PAGE_LIMIT note
  // below). A week-wide admin review across many groups can approach the cap
  // even at modest deployment sizes; explicit range keeps results stable.
  const { data, error } = await client
    .from("attendance_records")
    .select(ATTENDANCE_RECORD_SELECT)
    .in("session_id", sessionIds)
    .range(0, 9999)
    .returns<AttendanceRecordsRow[]>();
  if (error)
    return {
      data: null,
      error: wrapError("fetchAttendanceRecordsForSessions", error),
    };
  return { data: data ?? [], error: null };
}

// Supabase REST responses default-cap rows at ~1000. Free-tier dashboards stay well
// below this, but we widen the cap with an explicit range so pipeline counts stop
// silently truncating once a project crosses the default. Beyond ~10k guests this
// should switch to per-stage `count: exact` queries instead of row reads.
const GUEST_PAGE_LIMIT = 10000;

/**
 * Domain read-model for the guests directory. Exposes only the fields the
 * `/admin/guests` surface renders, so audit columns and any future schema
 * additions stay behind the read seam instead of flowing into the page and
 * its components as a raw `GuestsRow`. `Pick` from `GuestsRow` keeps the
 * field names and types byte-for-byte aligned with the table.
 */
export type GuestDirectoryEntry = Pick<
  GuestsRow,
  | "id"
  | "full_name"
  | "email"
  | "phone"
  | "first_attended_group_id"
  | "first_attended_date"
  | "pipeline_stage"
  | "assigned_group_id"
  | "follow_up_owner_id"
  | "notes"
  | "created_at"
>;

const GUEST_DIRECTORY_COLUMNS =
  "id, full_name, email, phone, first_attended_group_id, " +
  "first_attended_date, pipeline_stage, assigned_group_id, " +
  "follow_up_owner_id, notes, created_at";

export async function fetchGuests(
  client: ReadClient
): Promise<ReadResult<GuestDirectoryEntry[]>> {
  const { data, error } = await client
    .from("guests")
    .select(GUEST_DIRECTORY_COLUMNS)
    .order("created_at", { ascending: false })
    .range(0, GUEST_PAGE_LIMIT - 1)
    .returns<GuestDirectoryEntry[]>();
  if (error) return { data: null, error: wrapError("fetchGuests", error) };
  return { data: data ?? [], error: null };
}

/**
 * Open follow-ups summary helper used by both the admin dashboard
 * (`getAdminDashboardData`) and the per-group leader dashboard
 * (`buildLeaderGroupDashboard`).
 *
 * Selects via {@link LEADER_FOLLOW_UP_COLUMNS} and returns
 * {@link LeaderFollowUpRow}, i.e. **never** includes `admin_private_note`.
 * Admin surfaces that genuinely need the admin-private note (only
 * `/admin/follow-ups` today) must use {@link fetchFollowUpsForAdmin}
 * instead. The narrowing here matters because this helper is reachable
 * from the leader request path — Phase 5C.1 hardened it so the SQL-level
 * privacy claim holds, not just the rendered-output claim.
 */
export async function fetchOpenFollowUps(
  client: ReadClient,
  options: { groupId?: string; limit?: number } = {}
): Promise<ReadResult<LeaderFollowUpRow[]>> {
  let query = client
    .from("follow_ups")
    .select(LEADER_FOLLOW_UP_COLUMNS.select)
    .in("status", ["open", "in_progress"])
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false });
  if (options.groupId) query = query.eq("related_group_id", options.groupId);
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query.returns<LeaderFollowUpRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchOpenFollowUps", error) };
  return { data: data ?? [], error: null };
}

/**
 * Accurate, UNtruncated count of OPEN follow-ups due within the "this week"
 * window — anything with a `due_date` on or before `dueOnOrBeforeIso`
 * (inclusive of today and anything already overdue), matching the
 * `isDueThisWeek` horizon the Home "This week" card renders.
 *
 * The card itself can only see the first `limit` rows of {@link fetchOpenFollowUps}
 * (ordered by priority then due_date), so a lower-priority item due this week can
 * fall outside that cap and be undercounted. This is a `head:true` exact count —
 * it reads no rows, just the total — so the card can show a faithful figure
 * without lifting the row cap. Open == `status in ('open','in_progress')`, the
 * same predicate `fetchOpenFollowUps` uses.
 */
export async function fetchOpenFollowUpsDueCount(
  client: ReadClient,
  options: { dueOnOrBeforeIso: string }
): Promise<ReadResult<number>> {
  const { count, error } = await client
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "in_progress"])
    .not("due_date", "is", null)
    .lte("due_date", options.dueOnOrBeforeIso);
  if (error)
    return {
      data: null,
      error: wrapError("fetchOpenFollowUpsDueCount", error),
    };
  return { data: count ?? 0, error: null };
}

export type GroupHealthAssessmentRatingRow = Pick<
  GroupHealthAssessmentsRow,
  "group_id" | "spiritual_growth_score" | "group_question_score"
>;

export const GROUP_HEALTH_ASSESSMENT_RATING_COLUMNS = [
  "group_id",
  "spiritual_growth_score",
  "group_question_score",
] as const satisfies readonly (keyof GroupHealthAssessmentsRow)[];

const GROUP_HEALTH_ASSESSMENT_RATING_SELECT =
  GROUP_HEALTH_ASSESSMENT_RATING_COLUMNS.join(", ");

export async function fetchGroupHealthAssessmentRatings(
  client: ReadClient,
  options: { periodMonth: string }
): Promise<ReadResult<GroupHealthAssessmentRatingRow[]>> {
  const { data, error } = await client
    .from("group_health_assessments")
    .select(GROUP_HEALTH_ASSESSMENT_RATING_SELECT)
    .eq("period_month", options.periodMonth)
    .returns<GroupHealthAssessmentRatingRow[]>();
  if (error) {
    return {
      data: null,
      error: wrapError("fetchGroupHealthAssessmentRatings", error),
    };
  }
  return { data: data ?? [], error: null };
}

// Column allowlist for the group-health-update fetcher (#495); every
// GroupHealthUpdatesRow column (the admin review renders leader_note and
// admin_note side by side), pinned by a colocated test.
export const GROUP_HEALTH_UPDATE_COLUMNS = [
  "id",
  "group_id",
  "submitted_by",
  "update_week",
  "pulse",
  "follow_up_needed",
  "leader_note",
  "admin_note",
  "created_at",
] as const satisfies readonly (keyof GroupHealthUpdatesRow)[];

const GROUP_HEALTH_UPDATE_SELECT = GROUP_HEALTH_UPDATE_COLUMNS.join(", ");

export async function fetchLatestHealthUpdates(
  client: ReadClient,
  options: { groupId?: string; updateWeek?: string } = {}
): Promise<ReadResult<GroupHealthUpdatesRow[]>> {
  let query = client
    .from("group_health_updates")
    .select(GROUP_HEALTH_UPDATE_SELECT)
    .order("update_week", { ascending: false });
  if (options.groupId) query = query.eq("group_id", options.groupId);
  if (options.updateWeek) query = query.eq("update_week", options.updateWeek);
  const { data, error } = await query.returns<GroupHealthUpdatesRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchLatestHealthUpdates", error) };
  return { data: data ?? [], error: null };
}

// Column allowlist for the active-membership fetcher (#495); every
// GroupMembershipsRow column, pinned by a colocated test.
export const GROUP_MEMBERSHIP_COLUMNS = [
  "id",
  "group_id",
  "member_id",
  "role",
  "status",
  "joined_at",
  "ended_at",
  "created_at",
] as const satisfies readonly (keyof GroupMembershipsRow)[];

const GROUP_MEMBERSHIP_SELECT = GROUP_MEMBERSHIP_COLUMNS.join(", ");

export async function fetchActiveMemberships(
  client: ReadClient,
  options: { groupId?: string } = {}
): Promise<ReadResult<GroupMembershipsRow[]>> {
  let query = client
    .from("group_memberships")
    .select(GROUP_MEMBERSHIP_SELECT)
    .eq("status", "active");
  if (options.groupId) query = query.eq("group_id", options.groupId);
  const { data, error } = await query.returns<GroupMembershipsRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchActiveMemberships", error) };
  return { data: data ?? [], error: null };
}

// Column allowlist for the full-row members fetchers (#495). Names every
// MembersRow column so the directory surfaces keep their data, while a future
// members column (members carry pastoral signals like care_sensitivity_flag)
// no longer flows to every caller by default. Pinned by a colocated test.
export const MEMBER_COLUMNS = [
  "id",
  "full_name",
  "email",
  "phone",
  "household_name",
  "status",
  "care_sensitivity_flag",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof MembersRow)[];

const MEMBER_SELECT = MEMBER_COLUMNS.join(", ");

// Supabase REST responses default-cap rows at ~1000 (see GUEST_PAGE_LIMIT).
// `fetchAllMembers` backs the People directory, the inline assign controls,
// and — via the group-detail People tab — the authoritative group roster, so
// widen past the cap with an explicit range. Without it a member whose name
// sorts past the first page would silently vanish from those lists once a
// deployment crosses ~1000 members (a false-empty, not an error). Beyond ~10k
// members this should move to keyset pagination.
const MEMBER_PAGE_LIMIT = 10000;

export async function fetchMembersByIds(
  client: ReadClient,
  ids: string[]
): Promise<ReadResult<MembersRow[]>> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await client
    .from("members")
    .select(MEMBER_SELECT)
    .in("id", ids)
    .returns<MembersRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchMembersByIds", error) };
  return { data: data ?? [], error: null };
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

// Column allowlist for the full-row guests fetcher (#495); every GuestsRow
// column, pinned by a colocated test. The admin directory read above uses the
// narrower GUEST_DIRECTORY_COLUMNS projection instead.
export const GUEST_COLUMNS = [
  "id",
  "full_name",
  "email",
  "phone",
  "first_attended_group_id",
  "first_attended_date",
  "pipeline_stage",
  "assigned_group_id",
  "follow_up_owner_id",
  "notes",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof GuestsRow)[];

const GUEST_SELECT = GUEST_COLUMNS.join(", ");

export async function fetchNewGuestsForGroupSince(
  client: ReadClient,
  groupId: string,
  sinceIsoDate: string
): Promise<ReadResult<GuestsRow[]>> {
  const { data, error } = await client
    .from("guests")
    .select(GUEST_SELECT)
    .or(`first_attended_group_id.eq.${groupId},assigned_group_id.eq.${groupId}`)
    .gte("first_attended_date", sinceIsoDate)
    .returns<GuestsRow[]>();
  if (error)
    return {
      data: null,
      error: wrapError("fetchNewGuestsForGroupSince", error),
    };
  return { data: data ?? [], error: null };
}

// Phase 5A.6 group calendar readers. RLS already scopes these to
// admin / leader-of-group via the SELECT policies in
// supabase/migrations/20260518140000_phase5a6_group_calendar.sql, so
// callers can pass arbitrary filters and the database enforces access.
//
// Archive filter precedence: archivedOnly > includeArchived. Use
// archivedOnly:true for the leader / admin "Archived" tabs; the
// includeArchived:true escape hatch returns both active and archived
// rows and is reserved for surfaces that explicitly want the full set
// (none in this phase).
export type CalendarEventReadOptions = {
  groupId?: string;
  groupIds?: string[];
  fromDate?: string; // YYYY-MM-DD inclusive
  toDate?: string; // YYYY-MM-DD inclusive
  includeArchived?: boolean; // default false (active only)
  archivedOnly?: boolean; // when true, returns only archived rows
};

// Match the fetchAttendanceRecordsForSessions defensive cap so a
// week-wide admin batch (events across all groups) can't silently
// truncate at PostgREST's default 1000-row cap. The override resolver
// depends on a *complete* per-group event set -- truncation would
// produce some groups evaluated as if they had no calendar override.
const CALENDAR_EVENTS_PAGE_LIMIT = 10000;

// Column allowlist for the group-calendar fetcher (#495); every
// GroupCalendarEventsRow column, pinned by a colocated test. This read is
// reachable from both admin and leader calendar surfaces, so the pin matters
// doubly: a future admin-only calendar column added to the table cannot flow
// into a leader context without showing up as a deliberate diff here.
export const GROUP_CALENDAR_EVENT_COLUMNS = [
  "id",
  "group_id",
  "event_date",
  "start_time",
  "end_time",
  "event_type",
  "status",
  "title",
  "description",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
  "archived_at",
] as const satisfies readonly (keyof GroupCalendarEventsRow)[];

const GROUP_CALENDAR_EVENT_SELECT = GROUP_CALENDAR_EVENT_COLUMNS.join(", ");

export async function fetchGroupCalendarEvents(
  client: ReadClient,
  options: CalendarEventReadOptions = {}
): Promise<ReadResult<GroupCalendarEventsRow[]>> {
  let query = client
    .from("group_calendar_events")
    .select(GROUP_CALENDAR_EVENT_SELECT)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true });
  if (options.groupId) query = query.eq("group_id", options.groupId);
  if (options.groupIds) {
    if (options.groupIds.length === 0) return { data: [], error: null };
    query = query.in("group_id", options.groupIds);
  }
  if (options.fromDate) query = query.gte("event_date", options.fromDate);
  if (options.toDate) query = query.lte("event_date", options.toDate);
  if (options.archivedOnly) {
    query = query.not("archived_at", "is", null);
  } else if (!options.includeArchived) {
    query = query.is("archived_at", null);
  }
  query = query.range(0, CALENDAR_EVENTS_PAGE_LIMIT - 1);
  const { data, error } = await query.returns<GroupCalendarEventsRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchGroupCalendarEvents", error) };
  return { data: data ?? [], error: null };
}

export async function fetchUpcomingCalendarEventsForGroups(
  client: ReadClient,
  groupIds: string[],
  fromDate: string,
  toDate: string
): Promise<ReadResult<GroupCalendarEventsRow[]>> {
  if (groupIds.length === 0) return { data: [], error: null };
  return fetchGroupCalendarEvents(client, {
    groupIds,
    fromDate,
    toDate,
    includeArchived: false,
  });
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

// ----- Admin-scoped readers (Phase 5A.1). RLS already permits these for
// super_admin / ministry_admin via the Phase 4 policies.
// -------------------------------------------------------------------------

// Column allowlist for the admin profiles directory read (#495). Names every
// ProfilesRow column — the directory renders contact + role/status and the
// row type is the trust boundary — so a future profiles column cannot
// silently widen this high-fan-out read. The per-request session profile
// read has its own narrower allowlist in lib/auth/session.ts (#492).
export const PROFILE_COLUMNS = [
  "id",
  "auth_user_id",
  "full_name",
  "email",
  "phone",
  "role",
  "status",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof ProfilesRow)[];

const PROFILE_SELECT = PROFILE_COLUMNS.join(", ");

export async function fetchProfilesForAdmin(
  client: ReadClient,
  options: { roles?: UserRole[]; statuses?: ProfileStatus[] } = {}
): Promise<ReadResult<ProfilesRow[]>> {
  let query = client
    .from("profiles")
    .select(PROFILE_SELECT)
    .order("full_name", { ascending: true });
  if (options.roles && options.roles.length > 0)
    query = query.in("role", options.roles);
  if (options.statuses && options.statuses.length > 0)
    query = query.in("status", options.statuses);
  const { data, error } = await query.returns<ProfilesRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchProfilesForAdmin", error) };
  return { data: data ?? [], error: null };
}

export async function fetchAllMembers(
  client: ReadClient,
  options: { statuses?: MembershipStatus[] } = {}
): Promise<ReadResult<MembersRow[]>> {
  let query = client
    .from("members")
    .select(MEMBER_SELECT)
    .order("full_name", { ascending: true })
    .range(0, MEMBER_PAGE_LIMIT - 1);
  if (options.statuses && options.statuses.length > 0)
    query = query.in("status", options.statuses);
  const { data, error } = await query.returns<MembersRow[]>();
  if (error) return { data: null, error: wrapError("fetchAllMembers", error) };
  return { data: data ?? [], error: null };
}

// Column allowlist for the group-leader assignment read (#495); every
// GroupLeadersRow column, pinned by a colocated test.
export const GROUP_LEADER_COLUMNS = [
  "id",
  "group_id",
  "profile_id",
  "role",
  "assigned_at",
  "active",
  "created_at",
] as const satisfies readonly (keyof GroupLeadersRow)[];

const GROUP_LEADER_SELECT = GROUP_LEADER_COLUMNS.join(", ");

export async function fetchAllGroupLeaders(
  client: ReadClient,
  options: { activeOnly?: boolean } = {}
): Promise<ReadResult<GroupLeadersRow[]>> {
  let query = client.from("group_leaders").select(GROUP_LEADER_SELECT);
  if (options.activeOnly) query = query.eq("active", true);
  const { data, error } = await query.returns<GroupLeadersRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchAllGroupLeaders", error) };
  return { data: data ?? [], error: null };
}

// Phase 5A.4: Settings readers.

// Column allowlist for the keyed app_settings readers (#495); every
// AppSettingsRow column, pinned by a colocated test. Shared by the
// metric-defaults, group-health-rubric, and launch-planning-assumptions
// readers — they all fetch one keyed row and guard it with isAppSettingsRow.
export const APP_SETTINGS_COLUMNS = [
  "id",
  "setting_key",
  "setting_value",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof AppSettingsRow)[];

const APP_SETTINGS_SELECT = APP_SETTINGS_COLUMNS.join(", ");

// Returns the single `metric_defaults` row from `app_settings`. The row is
// seeded by the Phase 5A.4 migration and never deleted; a `null` return
// here means either Supabase rejected the read or the row was manually
// removed. Callers should treat null as "use built-in defaults".
export async function fetchMetricDefaults(
  client: ReadClient
): Promise<ReadResult<AppSettingsRow | null>> {
  const { data, error } = await client
    .from("app_settings")
    .select(APP_SETTINGS_SELECT)
    .eq("setting_key", "metric_defaults")
    .maybeSingle();
  if (error)
    return { data: null, error: wrapError("fetchMetricDefaults", error) };
  if (data === null || data === undefined) return { data: null, error: null };
  if (!isAppSettingsRow(data)) {
    return {
      data: null,
      error: wrapError("fetchMetricDefaults", new Error("shape_invalid")),
    };
  }
  return { data, error: null };
}

// Returns the admin-managed canonical free-text group-type list from the
// `group_types` keyed app_settings row (`{ types: string[] }`). Mirrors
// fetchMetricDefaults: a null/absent/shape-invalid row decodes to the empty
// list (no types configured yet). Admin-only via RLS.
export async function fetchGroupTypes(
  client: ReadClient
): Promise<ReadResult<string[]>> {
  const { data, error } = await client
    .from("app_settings")
    .select(APP_SETTINGS_SELECT)
    .eq("setting_key", "group_types")
    .maybeSingle();
  if (error) return { data: null, error: wrapError("fetchGroupTypes", error) };
  if (data === null || data === undefined) return { data: [], error: null };
  const row: unknown = data;
  if (!isAppSettingsRow(row)) {
    return {
      data: null,
      error: wrapError("fetchGroupTypes", new Error("shape_invalid")),
    };
  }
  const raw = (row.setting_value as Record<string, unknown>).types;
  if (!Array.isArray(raw)) return { data: [], error: null };
  const types = raw.filter((v): v is string => typeof v === "string");
  return { data: types, error: null };
}

// Returns the per-type config rows (target group count + optional readiness-rule
// override) keyed on the free-text group_type name. A type with no row inherits
// target 0 + the single global readiness rule. Admin-only via RLS.
const GROUP_TYPE_CONFIG_COLUMNS =
  "group_type, target_count, readiness_rule" as const;

export type GroupTypeConfigEntry = Pick<
  GroupTypeConfigsRow,
  "group_type" | "target_count" | "readiness_rule"
>;

export async function fetchGroupTypeConfigs(
  client: ReadClient
): Promise<ReadResult<GroupTypeConfigEntry[]>> {
  const { data, error } = await client
    .from("group_type_configs")
    .select(GROUP_TYPE_CONFIG_COLUMNS)
    .order("group_type", { ascending: true });
  if (error)
    return { data: null, error: wrapError("fetchGroupTypeConfigs", error) };
  return { data: (data ?? []) as GroupTypeConfigEntry[], error: null };
}

// Phase SAC.1 (#159): returns the single `platform_config` row from the
// Super-Admin-only platform_config table. RLS scopes the read to super_admin;
// a non-super-admin caller sees no row (and the console route never reaches
// here anyway). A `null` return means the row is missing or the read failed;
// callers decode null to the built-in config via decodeAppConfig.
export async function fetchPlatformConfig(
  client: ReadClient
): Promise<
  ReadResult<Pick<PlatformConfigRow, "setting_key" | "setting_value"> | null>
> {
  // Project only the columns the decoder needs. This is a Super-Admin-only
  // store slated to hold future flags + editable copy, so an explicit column
  // list keeps later schema additions from silently widening the console's
  // read surface (vs. select("*")).
  const { data, error } = await client
    .from("platform_config")
    .select("setting_key, setting_value")
    .eq("setting_key", "platform_config")
    .maybeSingle();
  if (error)
    return { data: null, error: wrapError("fetchPlatformConfig", error) };
  if (data === null || data === undefined) return { data: null, error: null };
  if (!isAppSettingsRow(data)) {
    return {
      data: null,
      error: wrapError("fetchPlatformConfig", new Error("shape_invalid")),
    };
  }
  return { data, error: null };
}

// Admin-readable feature-flag state (#256). Unlike fetchPlatformConfig, this
// reads through the SECURITY DEFINER admin_read_feature_flags() RPC, which
// returns ONLY the feature_flags sub-object and admits both super_admin and
// ministry_admin (auth_is_admin()). It exists so a frozen-surface gate resolves
// identically for both admin roles — a ministry_admin can't read platform_config
// directly, so the table read would always fail closed for them. The verify-
// before-flip rule still lives in lib/admin/feature-flags; this only fetches the
// stored flag map (decode it with decodeFeatureFlags). A null return means the
// RPC errored; callers decode null to "all flags off".
export async function fetchAdminFeatureFlags(
  client: ReadClient
): Promise<ReadResult<unknown>> {
  const { data, error } = await client.rpc("admin_read_feature_flags" as never);
  if (error)
    return { data: null, error: wrapError("fetchAdminFeatureFlags", error) };
  return { data: data ?? null, error: null };
}

// Returns the single `group_health_rubric` row from `app_settings`, holding the
// admin-tuned Group-Health weights / cut-lines / attendance window (#129). No
// row yet means the rubric has never been tuned; callers decode `null` to the
// built-in rubric, so an absent row is a safe no-op rather than an error.
export async function fetchGroupHealthRubricSetting(
  client: ReadClient
): Promise<ReadResult<AppSettingsRow | null>> {
  const { data, error } = await client
    .from("app_settings")
    .select(APP_SETTINGS_SELECT)
    .eq("setting_key", "group_health_rubric")
    .maybeSingle();
  if (error)
    return {
      data: null,
      error: wrapError("fetchGroupHealthRubricSetting", error),
    };
  if (data === null || data === undefined) return { data: null, error: null };
  if (!isAppSettingsRow(data)) {
    return {
      data: null,
      error: wrapError(
        "fetchGroupHealthRubricSetting",
        new Error("shape_invalid")
      ),
    };
  }
  return { data, error: null };
}

const CHURCH_ATTENDANCE_SNAPSHOT_COLUMNS =
  "id, snapshot_date, attendance_count, note, created_by_profile_id, " +
  "created_at, updated_at";

// Julian P2: most-recent-first church attendance snapshots. The first row is
// the latest known church-wide attendance, the denominator for the
// "% of the church in a life group" headline. Admin-only via RLS.
export async function fetchChurchAttendanceSnapshots(
  client: ReadClient,
  options: { limit?: number } = {}
): Promise<ReadResult<ChurchAttendanceSnapshotsRow[]>> {
  const limit = options.limit ?? 12;
  const { data, error } = await client
    .from("church_attendance_snapshots")
    .select(CHURCH_ATTENDANCE_SNAPSHOT_COLUMNS)
    .order("snapshot_date", { ascending: false })
    .limit(limit);
  if (error) {
    return {
      data: null,
      error: wrapError("fetchChurchAttendanceSnapshots", error),
    };
  }
  return { data: (data ?? []) as ChurchAttendanceSnapshotsRow[], error: null };
}

const MULTIPLICATION_CANDIDATE_COLUMNS =
  "id, group_id, target_year, status, " +
  "shepherd_willing, needs_similar_stage, " +
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
  // Earliest active co_leader assignment date (YYYY-MM-DD), or null.
  coShepherdSince: string | null;
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

function earliestCoShepherdByGroup(
  rows: ReadonlyArray<{ group_id: string; assigned_at: string }>
): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of rows) {
    const current = m.get(l.group_id);
    if (current === undefined || l.assigned_at < current) {
      m.set(l.group_id, l.assigned_at);
    }
  }
  return m;
}

// Julian P4: active (non-archived) multiplication candidates enriched with the
// group facts the readiness helper needs (member count, launch date,
// co-shepherd tenure). Admin-only via RLS. Batches the group/membership/leader
// reads by the candidates' group ids to avoid N+1.
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
  const [groupsRes, membershipsRes, leadersRes, apprenticesRes] =
    await Promise.all([
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
      noGroups
        ? Promise.resolve({ data: [], error: null })
        : client
            .from("group_leaders")
            .select("group_id, assigned_at, role, active")
            .in("group_id", groupIds)
            .eq("role", "co_leader")
            .eq("active", true),
      apprenticeIds.length > 0
        ? client
            .from("leader_pipeline")
            .select("id, display_name, readiness_stage")
            .in("id", apprenticeIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  const batchError = firstReadError([
    {
      scope: "fetchMultiplicationCandidatesForAdmin/groups",
      error: groupsRes.error,
    },
    {
      scope: "fetchMultiplicationCandidatesForAdmin/memberships",
      error: membershipsRes.error,
    },
    {
      scope: "fetchMultiplicationCandidatesForAdmin/leaders",
      error: leadersRes.error,
    },
    {
      scope: "fetchMultiplicationCandidatesForAdmin/apprentices",
      error: apprenticesRes.error,
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
  const coShepherdSinceByGroup = earliestCoShepherdByGroup(
    (leadersRes.data ?? []) as { group_id: string; assigned_at: string }[]
  );

  const entries: MultiplicationCandidateEntry[] = candidates.map(
    (candidate) => ({
      candidate,
      // Type-only candidates carry no group → group/member/co-shepherd facts are
      // absent (group: null, 0 members, no co-shepherd date).
      group: candidate.group_id
        ? (groupById.get(candidate.group_id) ?? null)
        : null,
      activeMemberCount: candidate.group_id
        ? (memberCountByGroup.get(candidate.group_id) ?? 0)
        : 0,
      coShepherdSince: candidate.group_id
        ? (coShepherdSinceByGroup.get(candidate.group_id) ?? null)
        : null,
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
// per group (for the ready-to-multiply badge), the co-shepherd tenure for every
// group (for the readiness annotation), and the candidate flags/ids (so
// suggestions can be annotated and de-duped). Group/override/membership/default
// data is fetched separately via fetchLaunchPlanningInputsForAdmin.
export type CapacityBoardExtras = {
  apprentices: {
    id: string;
    group_id: string;
    display_name: string;
    readiness_stage: LeaderReadinessStage;
  }[];
  coShepherdSinceByGroup: Record<string, string>;
  candidateFlagsByGroup: Record<
    string,
    { shepherdWilling: boolean; needsSimilarStage: boolean }
  >;
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
    coShepherdSinceByGroup: {},
    candidateFlagsByGroup: {},
    candidateGroupIds: [],
    groupTypeByGroup: {},
    error: null,
  };

  const [apprenticesRes, leadersRes, candidatesRes, groupsRes] =
    await Promise.all([
      client
        .from("leader_pipeline")
        .select("id, group_id, display_name, readiness_stage")
        .is("archived_at", null),
      client
        .from("group_leaders")
        .select("group_id, assigned_at, role, active")
        .eq("role", "co_leader")
        .eq("active", true),
      client
        .from("multiplication_candidates")
        .select("group_id, shepherd_willing, needs_similar_stage")
        .is("archived_at", null),
      // Each group's free-text type, for the board's segment label.
      client.from("groups").select("id, group_type"),
    ]);

  const error =
    (apprenticesRes.error &&
      wrapError("fetchCapacityBoardExtras/apprentices", apprenticesRes.error)
        .message) ||
    (leadersRes.error &&
      wrapError("fetchCapacityBoardExtras/leaders", leadersRes.error)
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

  const coShepherdSinceByGroup: Record<string, string> = {};
  for (const l of (leadersRes.data ?? []) as {
    group_id: string;
    assigned_at: string;
  }[]) {
    const cur = coShepherdSinceByGroup[l.group_id];
    if (cur === undefined || l.assigned_at < cur) {
      coShepherdSinceByGroup[l.group_id] = l.assigned_at;
    }
  }

  const candidateFlagsByGroup: Record<
    string,
    { shepherdWilling: boolean; needsSimilarStage: boolean }
  > = {};
  const candidateGroupIds: string[] = [];
  for (const c of (candidatesRes.data ?? []) as {
    group_id: string | null;
    shepherd_willing: boolean;
    needs_similar_stage: boolean;
  }[]) {
    // Type-only candidates carry no group, so they neither flag a group nor
    // count as "already a candidate" on the capacity board.
    if (c.group_id == null) continue;
    candidateGroupIds.push(c.group_id);
    candidateFlagsByGroup[c.group_id] = {
      shepherdWilling: c.shepherd_willing,
      needsSimilarStage: c.needs_similar_stage,
    };
  }

  return {
    apprentices: (apprenticesRes.data ??
      []) as CapacityBoardExtras["apprentices"],
    coShepherdSinceByGroup,
    candidateFlagsByGroup,
    candidateGroupIds,
    groupTypeByGroup,
    error: null,
  };
}

// Returns every row in group_metric_settings. RLS on the table restricts
// reads to super_admin / ministry_admin, so calling this from any
// non-admin context will surface as an empty result. Admin pages call
// this once at load time and join client-side by group_id.
// Column allowlist for the per-group metric-override readers (#495); every
// GroupMetricSettingsRow column, pinned by a colocated test.
export const GROUP_METRIC_SETTINGS_COLUMNS = [
  "group_id",
  "capacity_override",
  "capacity_warning_threshold_pct_override",
  "healthy_attendance_pct_override",
  "manual_health_status_override",
  "exclude_from_capacity_metrics",
  "admin_metric_notes",
  "check_in_due_offset_hours_override",
  "allow_over_capacity",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof GroupMetricSettingsRow)[];

const GROUP_METRIC_SETTINGS_SELECT = GROUP_METRIC_SETTINGS_COLUMNS.join(", ");

export async function fetchAllGroupMetricSettings(
  client: ReadClient
): Promise<ReadResult<GroupMetricSettingsRow[]>> {
  const { data, error } = await client
    .from("group_metric_settings")
    .select(GROUP_METRIC_SETTINGS_SELECT)
    .returns<GroupMetricSettingsRow[]>();
  if (error)
    return {
      data: null,
      error: wrapError("fetchAllGroupMetricSettings", error),
    };
  return { data: data ?? [], error: null };
}

export async function fetchGroupMetricSettings(
  client: ReadClient,
  groupId: string
): Promise<ReadResult<GroupMetricSettingsRow | null>> {
  const { data, error } = await client
    .from("group_metric_settings")
    .select(GROUP_METRIC_SETTINGS_SELECT)
    .eq("group_id", groupId)
    .maybeSingle();
  if (error)
    return { data: null, error: wrapError("fetchGroupMetricSettings", error) };
  if (data === null || data === undefined) return { data: null, error: null };
  if (!isGroupMetricSettingsRow(data)) {
    return {
      data: null,
      error: wrapError("fetchGroupMetricSettings", new Error("shape_invalid")),
    };
  }
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// LP.1 — launch planning assumptions
// ---------------------------------------------------------------------------
//
// Reads the single `launch_planning_assumptions` row from app_settings.
// Uses the shared APP_SETTINGS_COLUMNS allowlist (no select("*") on
// launch-planning paths) and the same `isAppSettingsRow` trust-boundary
// guard as the metric_defaults reader. A `null` data return means either
// the row was never seeded (treat as "use built-in defaults") or the shape
// guard rejected the row.
export async function fetchLaunchPlanningAssumptions(
  client: ReadClient
): Promise<ReadResult<AppSettingsRow | null>> {
  const { data, error } = await client
    .from("app_settings")
    .select(APP_SETTINGS_SELECT)
    .eq("setting_key", "launch_planning_assumptions")
    .maybeSingle();
  if (error)
    return {
      data: null,
      error: wrapError("fetchLaunchPlanningAssumptions", error),
    };
  if (data === null || data === undefined) return { data: null, error: null };
  if (!isAppSettingsRow(data)) {
    return {
      data: null,
      error: wrapError(
        "fetchLaunchPlanningAssumptions",
        new Error("shape_invalid")
      ),
    };
  }
  return { data, error: null };
}

// Bundle the four independent reads the launch-planning page needs.
// Returns a partial-success shape so the page can render setup warnings
// when any individual read fails, rather than blanking the whole page.
export type LaunchPlanningInputsBundle = {
  groups: GroupsRow[];
  groupMetricSettings: GroupMetricSettingsRow[];
  memberships: GroupMembershipsRow[];
  metricDefaultsRow: AppSettingsRow | null;
  errors: {
    groups: string | null;
    overrides: string | null;
    memberships: string | null;
    metricDefaults: string | null;
  };
};

export async function fetchLaunchPlanningInputsForAdmin(
  client: ReadClient
): Promise<LaunchPlanningInputsBundle> {
  const [groupsRes, overridesRes, membershipsRes, defaultsRes] =
    await Promise.all([
      fetchAllGroups(client),
      fetchAllGroupMetricSettings(client),
      fetchActiveMemberships(client),
      fetchMetricDefaults(client),
    ]);
  return {
    groups: groupsRes.data ?? [],
    groupMetricSettings: overridesRes.data ?? [],
    memberships: membershipsRes.data ?? [],
    metricDefaultsRow: defaultsRes.data ?? null,
    errors: {
      groups: groupsRes.error?.message ?? null,
      overrides: overridesRes.error?.message ?? null,
      memberships: membershipsRes.error?.message ?? null,
      metricDefaults: defaultsRes.error?.message ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// LP.2 — launch planning scenarios
// ---------------------------------------------------------------------------
//
// Explicit column allowlist. `assumptions` is a JSONB column; the trust-
// boundary guard checks it's a plain object before the row is handed to
// the pure decoder.

const LAUNCH_PLANNING_SCENARIO_COLUMNS =
  "id, name, description, assumptions, is_current, archived_at, created_by, updated_by, created_at, updated_at";

function isLaunchPlanningScenarioRow(
  v: unknown
): v is LaunchPlanningScenariosRow {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (!isUuid(r.id)) return false;
  if (typeof r.name !== "string") return false;
  if (typeof r.is_current !== "boolean") return false;
  if (
    typeof r.assumptions !== "object" ||
    r.assumptions === null ||
    Array.isArray(r.assumptions)
  ) {
    return false;
  }
  return true;
}

export async function fetchLaunchPlanningScenariosForAdmin(
  client: ReadClient
): Promise<ReadResult<LaunchPlanningScenariosRow[]>> {
  const { data, error } = await client
    .from("launch_planning_scenarios")
    .select(LAUNCH_PLANNING_SCENARIO_COLUMNS)
    .order("is_current", { ascending: false })
    .order("name", { ascending: true });
  if (error)
    return {
      data: null,
      error: wrapError("fetchLaunchPlanningScenariosForAdmin", error),
    };
  const raw: unknown[] = (data ?? []) as unknown[];
  const rows: LaunchPlanningScenariosRow[] = [];
  for (const row of raw) {
    if (isLaunchPlanningScenarioRow(row)) rows.push(row);
  }
  return { data: rows, error: null };
}

export async function fetchLaunchPlanningScenarioByIdForAdmin(
  client: ReadClient,
  id: string
): Promise<ReadResult<LaunchPlanningScenariosRow | null>> {
  const { data, error } = await client
    .from("launch_planning_scenarios")
    .select(LAUNCH_PLANNING_SCENARIO_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error)
    return {
      data: null,
      error: wrapError("fetchLaunchPlanningScenarioByIdForAdmin", error),
    };
  if (data == null) return { data: null, error: null };
  const raw: unknown = data;
  if (!isLaunchPlanningScenarioRow(raw)) {
    return {
      data: null,
      error: wrapError(
        "fetchLaunchPlanningScenarioByIdForAdmin",
        new Error("shape_invalid")
      ),
    };
  }
  return { data: raw, error: null };
}
