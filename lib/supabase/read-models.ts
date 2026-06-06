import type {
  AppSettingsRow,
  AttendanceRecordsRow,
  AttendanceSessionsRow,
  AuditEventsRow,
  CareNotesRow,
  ChurchAttendanceSnapshotsRow,
  FollowUpsRow,
  GroupCalendarEventsRow,
  GroupHealthUpdatesRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  GuestsRow,
  LaunchPlanningScenariosRow,
  LeaderPipelineRow,
  MembersRow,
  MultiplicationCandidatesRow,
  NoteTransparencyGrantsRow,
  PlatformConfigRow,
  PrayerRequestsRow,
  ProfilesRow,
} from "@/types/database";
import type {
  FollowUpStatus,
  GuestPipelineStage,
  LeaderReadinessStage,
  MembershipStatus,
  ProfileStatus,
  UserRole,
} from "@/types/enums";
import { isUuid } from "@/lib/shared/uuid";
import { churchDayStartUtcIso } from "@/lib/shared/church-time";
import {
  currentUtcDateIso,
  differenceInDaysIso,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

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

export async function fetchAllGroups(
  client: ReadClient
): Promise<ReadResult<GroupsRow[]>> {
  const { data, error } = await client
    .from("groups")
    .select("*")
    .order("name", { ascending: true });
  if (error) return { data: null, error: wrapError("fetchAllGroups", error) };
  return { data: data ?? [], error: null };
}

export async function fetchGroupsByIds(
  client: ReadClient,
  ids: string[]
): Promise<ReadResult<GroupsRow[]>> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await client
    .from("groups")
    .select("*")
    .in("id", ids)
    .order("name", { ascending: true });
  if (error) return { data: null, error: wrapError("fetchGroupsByIds", error) };
  return { data: data ?? [], error: null };
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
};

// Counts of dated activity within [fromIso, toExclusiveIso) for the executive
// overview's period band. `fromIso` null means all-time (upper bound only).
// Head-only count queries keep this cheap. Groups launched and guests welcomed
// are derived from arrays the dashboard already fetches, so they are NOT read
// here.
//
// joined_at and interaction_at are DATE columns (church-local calendar days),
// so the YYYY-MM-DD bounds compare directly. completed_at is a timestamptz, so
// its bounds are converted to the matching UTC instants of church-local
// midnight — otherwise a late-evening-local completion (which Postgres reads as
// the next UTC day) would land in the wrong period.
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

  const [membersRes, followUpsRes, interactionsRes] = await Promise.all([
    membersQ,
    followUpsQ,
    interactionsQ,
  ]);

  const firstError =
    membersRes.error || followUpsRes.error || interactionsRes.error;
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
    },
    error: null,
  };
}

export async function fetchAttendanceSessions(
  client: ReadClient,
  options: { groupId?: string; meetingWeek?: string; limit?: number } = {}
): Promise<ReadResult<AttendanceSessionsRow[]>> {
  let query = client
    .from("attendance_sessions")
    .select("*")
    .order("meeting_week", { ascending: false });
  if (options.groupId) query = query.eq("group_id", options.groupId);
  if (options.meetingWeek)
    query = query.eq("meeting_week", options.meetingWeek);
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
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
    .select("*")
    .in("session_id", sessionIds)
    .range(0, 9999);
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
    .select(LEADER_FOLLOW_UP_COLUMNS)
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

export async function fetchLatestHealthUpdates(
  client: ReadClient,
  options: { groupId?: string; updateWeek?: string } = {}
): Promise<ReadResult<GroupHealthUpdatesRow[]>> {
  let query = client
    .from("group_health_updates")
    .select("*")
    .order("update_week", { ascending: false });
  if (options.groupId) query = query.eq("group_id", options.groupId);
  if (options.updateWeek) query = query.eq("update_week", options.updateWeek);
  const { data, error } = await query;
  if (error)
    return { data: null, error: wrapError("fetchLatestHealthUpdates", error) };
  return { data: data ?? [], error: null };
}

export async function fetchActiveMemberships(
  client: ReadClient,
  options: { groupId?: string } = {}
): Promise<ReadResult<GroupMembershipsRow[]>> {
  let query = client
    .from("group_memberships")
    .select("*")
    .eq("status", "active");
  if (options.groupId) query = query.eq("group_id", options.groupId);
  const { data, error } = await query;
  if (error)
    return { data: null, error: wrapError("fetchActiveMemberships", error) };
  return { data: data ?? [], error: null };
}

export async function fetchMembersByIds(
  client: ReadClient,
  ids: string[]
): Promise<ReadResult<MembersRow[]>> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await client
    .from("members")
    .select("*")
    .in("id", ids);
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

export async function fetchNewGuestsForGroupSince(
  client: ReadClient,
  groupId: string,
  sinceIsoDate: string
): Promise<ReadResult<GuestsRow[]>> {
  const { data, error } = await client
    .from("guests")
    .select("*")
    .or(`first_attended_group_id.eq.${groupId},assigned_group_id.eq.${groupId}`)
    .gte("first_attended_date", sinceIsoDate);
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

export async function fetchGroupCalendarEvents(
  client: ReadClient,
  options: CalendarEventReadOptions = {}
): Promise<ReadResult<GroupCalendarEventsRow[]>> {
  let query = client
    .from("group_calendar_events")
    .select("*")
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
  const { data, error } = await query;
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

export async function fetchProfilesForAdmin(
  client: ReadClient,
  options: { roles?: UserRole[]; statuses?: ProfileStatus[] } = {}
): Promise<ReadResult<ProfilesRow[]>> {
  let query = client
    .from("profiles")
    .select("*")
    .order("full_name", { ascending: true });
  if (options.roles && options.roles.length > 0)
    query = query.in("role", options.roles);
  if (options.statuses && options.statuses.length > 0)
    query = query.in("status", options.statuses);
  const { data, error } = await query;
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
    .select("*")
    .order("full_name", { ascending: true });
  if (options.statuses && options.statuses.length > 0)
    query = query.in("status", options.statuses);
  const { data, error } = await query;
  if (error) return { data: null, error: wrapError("fetchAllMembers", error) };
  return { data: data ?? [], error: null };
}

export async function fetchAllGroupLeaders(
  client: ReadClient,
  options: { activeOnly?: boolean } = {}
): Promise<ReadResult<GroupLeadersRow[]>> {
  let query = client.from("group_leaders").select("*");
  if (options.activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error)
    return { data: null, error: wrapError("fetchAllGroupLeaders", error) };
  return { data: data ?? [], error: null };
}

// Phase 5A.4: Settings readers.

// Returns the single `metric_defaults` row from `app_settings`. The row is
// seeded by the Phase 5A.4 migration and never deleted; a `null` return
// here means either Supabase rejected the read or the row was manually
// removed. Callers should treat null as "use built-in defaults".
export async function fetchMetricDefaults(
  client: ReadClient
): Promise<ReadResult<AppSettingsRow | null>> {
  const { data, error } = await client
    .from("app_settings")
    .select("*")
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
    .select("*")
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
  "id, group_id, target_year, status, shepherd_willing, needs_similar_stage, " +
  "notes, successor_designate, meeting_time, leader_pipeline_id, archived_at, " +
  "created_by, updated_by, created_at, updated_at";

export type MultiplicationCandidateGroup = Pick<
  GroupsRow,
  | "id"
  | "name"
  | "audience_category"
  | "life_stage"
  | "launched_on"
  | "lifecycle_status"
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

  const groupIds = [...new Set(candidates.map((c) => c.group_id))];
  const apprenticeIds = [
    ...new Set(
      candidates
        .map((c) => c.leader_pipeline_id)
        .filter((id): id is string => id != null)
    ),
  ];

  const [groupsRes, membershipsRes, leadersRes, apprenticesRes] =
    await Promise.all([
      client
        .from("groups")
        .select(
          "id, name, audience_category, life_stage, launched_on, lifecycle_status"
        )
        .in("id", groupIds),
      client
        .from("group_memberships")
        .select("group_id, status")
        .in("group_id", groupIds)
        .eq("status", "active"),
      client
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
  if (groupsRes.error) {
    return {
      data: null,
      error: wrapError(
        "fetchMultiplicationCandidatesForAdmin/groups",
        groupsRes.error
      ),
    };
  }
  if (membershipsRes.error) {
    return {
      data: null,
      error: wrapError(
        "fetchMultiplicationCandidatesForAdmin/memberships",
        membershipsRes.error
      ),
    };
  }
  if (leadersRes.error) {
    return {
      data: null,
      error: wrapError(
        "fetchMultiplicationCandidatesForAdmin/leaders",
        leadersRes.error
      ),
    };
  }
  if (apprenticesRes.error) {
    return {
      data: null,
      error: wrapError(
        "fetchMultiplicationCandidatesForAdmin/apprentices",
        apprenticesRes.error
      ),
    };
  }

  const apprenticeById = new Map<string, MultiplicationCandidateApprentice>();
  for (const a of (apprenticesRes.data ?? []) as {
    id: string;
    display_name: string;
    readiness_stage: LeaderReadinessStage;
  }[]) {
    apprenticeById.set(a.id, {
      id: a.id,
      displayName: a.display_name,
      stage: a.readiness_stage,
    });
  }

  const groupById = new Map<string, MultiplicationCandidateGroup>();
  for (const g of (groupsRes.data ?? []) as MultiplicationCandidateGroup[]) {
    groupById.set(g.id, g);
  }

  const memberCountByGroup = new Map<string, number>();
  for (const m of (membershipsRes.data ?? []) as { group_id: string }[]) {
    memberCountByGroup.set(
      m.group_id,
      (memberCountByGroup.get(m.group_id) ?? 0) + 1
    );
  }

  const coShepherdSinceByGroup = new Map<string, string>();
  for (const l of (leadersRes.data ?? []) as {
    group_id: string;
    assigned_at: string;
  }[]) {
    const current = coShepherdSinceByGroup.get(l.group_id);
    if (current === undefined || l.assigned_at < current) {
      coShepherdSinceByGroup.set(l.group_id, l.assigned_at);
    }
  }

  const entries: MultiplicationCandidateEntry[] = candidates.map(
    (candidate) => ({
      candidate,
      group: groupById.get(candidate.group_id) ?? null,
      activeMemberCount: memberCountByGroup.get(candidate.group_id) ?? 0,
      coShepherdSince: coShepherdSinceByGroup.get(candidate.group_id) ?? null,
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

  const groupIds = [...new Set(apprentices.map((a) => a.group_id))];
  const groupsRes = await client
    .from("groups")
    .select("id, name")
    .in("id", groupIds);
  if (groupsRes.error) {
    return {
      data: null,
      error: wrapError("fetchLeaderPipelineForAdmin/groups", groupsRes.error),
    };
  }
  const nameById = new Map<string, string>();
  for (const g of (groupsRes.data ?? []) as { id: string; name: string }[]) {
    nameById.set(g.id, g.name);
  }

  const entries: LeaderPipelineEntry[] = apprentices.map((apprentice) => ({
    apprentice,
    groupName: nameById.get(apprentice.group_id) ?? null,
  }));
  return { data: entries, error: null };
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
    error: null,
  };

  const [apprenticesRes, leadersRes, candidatesRes] = await Promise.all([
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
    null;
  if (error) return { ...empty, error };

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
    group_id: string;
    shepherd_willing: boolean;
    needs_similar_stage: boolean;
  }[]) {
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
    error: null,
  };
}

// Returns every row in group_metric_settings. RLS on the table restricts
// reads to super_admin / ministry_admin, so calling this from any
// non-admin context will surface as an empty result. Admin pages call
// this once at load time and join client-side by group_id.
export async function fetchAllGroupMetricSettings(
  client: ReadClient
): Promise<ReadResult<GroupMetricSettingsRow[]>> {
  const { data, error } = await client
    .from("group_metric_settings")
    .select("*");
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
    .select("*")
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
// Phase 5C.0 — Guest pipeline + follow-up read models.
// ---------------------------------------------------------------------------

/**
 * Leader-safe follow_ups column list. `admin_private_note` is intentionally
 * **omitted** here so leader read paths never return it, even though the
 * table-level RLS SELECT policy currently exposes the column to any caller
 * with row access. This constant is the **defensive privacy boundary** for
 * the `/leader` surface.
 *
 * Privacy contract (Phase 5C.0 / 5C.1):
 *  - Every leader-facing query against `follow_ups` MUST select via this
 *    constant (or a narrower allowlist), never `select("*")`.
 *  - Every leader-facing helper MUST return `LeaderFollowUpRow` (which omits
 *    `admin_private_note` at the type level — see below).
 *  - Column-level RLS / a leader-safe Postgres view is documented as a
 *    future hardening item in `docs/PHASE_5C_1_PRIVACY_HARDENING.md`. Until
 *    that lands, this allowlist + type omission is the boundary.
 *
 * If you change this list, update `LeaderFollowUpRow` and re-run the
 * verification grep in `docs/PHASE_5C_1_VERIFICATION.md`.
 */
export const LEADER_FOLLOW_UP_COLUMNS =
  "id, type, title, related_group_id, related_member_id, related_guest_id, " +
  "assigned_to, priority, due_date, status, leader_visible_note, " +
  "created_at, updated_at, completed_at";

/**
 * Leader-safe row type for `follow_ups`. The `Omit<..., "admin_private_note">`
 * is the compile-time half of the privacy boundary documented above; the
 * `LEADER_FOLLOW_UP_COLUMNS` allowlist is the runtime half. Any helper that
 * fetches follow-ups for a leader-facing page MUST return this type.
 */
export type LeaderFollowUpRow = Omit<FollowUpsRow, "admin_private_note">;

/**
 * **Admin-only** follow-ups reader. Returns the full row including
 * `admin_private_note` and is intended for `/admin/follow-ups` and other
 * admin server contexts only.
 *
 * Do **not** call from any leader code path (`app/(protected)/leader/`,
 * `components/leader/`, `lib/leader/`). Leader paths must use
 * {@link fetchFollowUpsForLeader} which selects through
 * {@link LEADER_FOLLOW_UP_COLUMNS} and returns {@link LeaderFollowUpRow}.
 */
/**
 * Admin follow-ups column allowlist. Unlike {@link LEADER_FOLLOW_UP_COLUMNS}
 * this one **deliberately includes `admin_private_note`** — it is the
 * admin-only surface. Spelling the columns out (rather than `select("*")`)
 * keeps the admin-private exposure explicit at the read seam and stops
 * audit / future schema columns leaking into the page.
 */
const ADMIN_FOLLOW_UP_COLUMNS =
  "id, type, title, related_group_id, related_member_id, related_guest_id, " +
  "assigned_to, priority, due_date, status, leader_visible_note, " +
  "admin_private_note, created_at";

/**
 * Domain read-model for the `/admin/follow-ups` directory. Includes the
 * admin-only `admin_private_note` by design; see {@link ADMIN_FOLLOW_UP_COLUMNS}.
 */
export type AdminFollowUpEntry = Pick<
  FollowUpsRow,
  | "id"
  | "type"
  | "title"
  | "related_group_id"
  | "related_member_id"
  | "related_guest_id"
  | "assigned_to"
  | "priority"
  | "due_date"
  | "status"
  | "leader_visible_note"
  | "admin_private_note"
  | "created_at"
>;

export async function fetchFollowUpsForAdmin(
  client: ReadClient,
  options: { statuses?: FollowUpStatus[]; limit?: number } = {}
): Promise<ReadResult<AdminFollowUpEntry[]>> {
  let query = client
    .from("follow_ups")
    .select(ADMIN_FOLLOW_UP_COLUMNS)
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (options.statuses && options.statuses.length > 0) {
    query = query.in("status", options.statuses);
  }
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query
    .range(0, 9999)
    .returns<AdminFollowUpEntry[]>();
  if (error)
    return { data: null, error: wrapError("fetchFollowUpsForAdmin", error) };
  return { data: data ?? [], error: null };
}

/**
 * Leader-safe follow-ups reader. Selects via {@link LEADER_FOLLOW_UP_COLUMNS}
 * (which omits `admin_private_note`) and returns {@link LeaderFollowUpRow}.
 * Visibility: rows where `assigned_to = profileId` OR `related_group_id` is
 * in the caller's active leader/co_leader assignments. The OR clause is
 * enforced both here (in the PostgREST `or(...)` predicate) and at the RLS
 * layer by the Phase 4 `follow_ups_leader_read` policy.
 */
export async function fetchFollowUpsForLeader(
  client: ReadClient,
  options: { profileId: string; assignedGroupIds: readonly string[] }
): Promise<ReadResult<LeaderFollowUpRow[]>> {
  const { profileId, assignedGroupIds } = options;
  // Build an OR clause: assigned_to = me, OR related_group_id IN my groups.
  // We always include the assigned_to predicate; the group clause is added
  // only when there is at least one assigned group, so leaders with zero
  // assignments still see follow-ups owned personally.
  const orParts = [`assigned_to.eq.${profileId}`];
  if (assignedGroupIds.length > 0) {
    // PostgREST `in.(uuid,uuid,...)` -- uuids are safe identifiers, no quoting needed.
    orParts.push(`related_group_id.in.(${assignedGroupIds.join(",")})`);
  }
  const { data, error } = await client
    .from("follow_ups")
    .select(LEADER_FOLLOW_UP_COLUMNS)
    .or(orParts.join(","))
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .returns<LeaderFollowUpRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchFollowUpsForLeader", error) };
  return { data: data ?? [], error: null };
}

// Counts open + in_progress follow-ups per guest. Single query, grouped
// client-side so the guest list stays free of N+1 round trips.
export async function fetchGuestFollowUpCounts(
  client: ReadClient,
  guestIds: string[]
): Promise<ReadResult<Map<string, number>>> {
  if (guestIds.length === 0) return { data: new Map(), error: null };
  const { data, error } = await client
    .from("follow_ups")
    .select("related_guest_id, status")
    .in("related_guest_id", guestIds)
    .in("status", ["open", "in_progress"])
    .returns<{ related_guest_id: string | null; status: FollowUpStatus }[]>();
  if (error)
    return { data: null, error: wrapError("fetchGuestFollowUpCounts", error) };
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.related_guest_id) continue;
    counts.set(
      row.related_guest_id,
      (counts.get(row.related_guest_id) ?? 0) + 1
    );
  }
  return { data: counts, error: null };
}

// Returns { id, full_name } for guests the caller can see via RLS. Leaders
// only see guests tied to a group they lead; admins see all. The UI uses
// the returned set to render guest names on follow-up cards safely (any
// guest id missing from the set is rendered as "Guest" without a name).
export async function fetchGuestNamesByIds(
  client: ReadClient,
  guestIds: string[]
): Promise<ReadResult<Map<string, string>>> {
  if (guestIds.length === 0) return { data: new Map(), error: null };
  const { data, error } = await client
    .from("guests")
    .select("id, full_name")
    .in("id", guestIds)
    .returns<{ id: string; full_name: string }[]>();
  if (error)
    return { data: null, error: wrapError("fetchGuestNamesByIds", error) };
  return {
    data: new Map((data ?? []).map((r) => [r.id, r.full_name])),
    error: null,
  };
}

export async function fetchRecentAuditEvents(
  client: ReadClient,
  options: { limit?: number; actionsLike?: string | string[] } = {}
): Promise<ReadResult<AuditEventsRow[]>> {
  const limit = options.limit ?? 25;
  let query = client
    .from("audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (options.actionsLike) {
    if (Array.isArray(options.actionsLike)) {
      // PostgREST OR syntax. Each pattern becomes `action.like."<value>"`
      // and they're joined by commas. The value must be wrapped in double
      // quotes when it contains a `.` (or `,`, `(`, `)`, `:`) because the
      // PostgREST grammar uses unquoted dots as `column.operator.value`
      // separators -- without quotes, a pattern like `admin.%` is parsed
      // as four tokens and rejected at the API boundary.
      // Reject patterns that themselves contain `"`, `,`, or `(` so we
      // don't end up constructing a malformed filter expression.
      for (const pat of options.actionsLike) {
        if (/["(),]/.test(pat)) {
          return {
            data: null,
            error: wrapError(
              "fetchRecentAuditEvents",
              new Error(`unsafe actionsLike pattern: ${pat}`)
            ),
          };
        }
      }
      const orExpr = options.actionsLike
        .map((pat) => `action.like."${pat}"`)
        .join(",");
      query = query.or(orExpr);
    } else {
      query = query.like("action", options.actionsLike);
    }
  }
  const { data, error } = await query;
  if (error)
    return { data: null, error: wrapError("fetchRecentAuditEvents", error) };
  return { data: data ?? [], error: null };
}

// ---------------------------------------------------------------------------
// LP.1 — launch planning assumptions
// ---------------------------------------------------------------------------
//
// Reads the single `launch_planning_assumptions` row from app_settings.
// Uses an explicit column allowlist (no select("*") on launch-planning
// paths) and the same `isAppSettingsRow` trust-boundary guard as the
// metric_defaults reader. A `null` data return means either the row was
// never seeded (treat as "use built-in defaults") or the shape guard
// rejected the row.
const LAUNCH_PLANNING_ASSUMPTIONS_COLUMNS =
  "id, setting_key, setting_value, created_at, updated_at";

export async function fetchLaunchPlanningAssumptions(
  client: ReadClient
): Promise<ReadResult<AppSettingsRow | null>> {
  const { data, error } = await client
    .from("app_settings")
    .select(LAUNCH_PLANNING_ASSUMPTIONS_COLUMNS)
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

// ---------------------------------------------------------------------------
// Pivot slice 9 (#381 / ADR 0017) — Care Notes + Prayer Requests + the
// per-subject transparency grant reads.
//
// Column-allowlisted reads (never select("*")). RLS is the real boundary: the
// author reads their own rows, and the oversight ladder reads a subject's rows
// only when that subject has an active transparency grant — so these readers
// return whatever the caller's RLS admits. The transparency-grant reader is
// admin-only by RLS and powers the inline Care toggle's current state.
// ---------------------------------------------------------------------------

const CARE_NOTE_COLUMNS =
  "id, author_profile_id, subject_profile_id, subject_group_id, body, created_at, updated_at";

const PRAYER_REQUEST_COLUMNS =
  "id, author_profile_id, subject_profile_id, subject_group_id, body, status, created_at, updated_at";

const NOTE_TRANSPARENCY_GRANT_COLUMNS =
  "id, subject_profile_id, granted, set_by, created_at, updated_at";

export async function fetchCareNotesForSubject(
  client: ReadClient,
  subjectProfileId: string
): Promise<ReadResult<CareNotesRow[]>> {
  if (!isUuid(subjectProfileId)) return { data: [], error: null };
  const { data, error } = await client
    .from("care_notes")
    .select(CARE_NOTE_COLUMNS)
    .eq("subject_profile_id", subjectProfileId)
    .order("created_at", { ascending: false });
  if (error)
    return { data: null, error: wrapError("fetchCareNotesForSubject", error) };
  return { data: (data ?? []) as CareNotesRow[], error: null };
}

export async function fetchPrayerRequestsForSubject(
  client: ReadClient,
  subjectProfileId: string
): Promise<ReadResult<PrayerRequestsRow[]>> {
  if (!isUuid(subjectProfileId)) return { data: [], error: null };
  const { data, error } = await client
    .from("prayer_requests")
    .select(PRAYER_REQUEST_COLUMNS)
    .eq("subject_profile_id", subjectProfileId)
    .order("created_at", { ascending: false });
  if (error)
    return {
      data: null,
      error: wrapError("fetchPrayerRequestsForSubject", error),
    };
  return { data: (data ?? []) as PrayerRequestsRow[], error: null };
}

// Pivot slice 11 (#382 / ADR 0020): a leader's GROUP-scoped care notes / prayer
// requests, newest first. RLS scopes the rows: a leader reads their own
// (author) rows for the group; the oversight ladder reads them only when that
// leader's transparency toggle is on. The group filter is belt-and-suspenders
// on top of RLS so the leader surface only ever asks for one group at a time.
export async function fetchGroupCareNotes(
  client: ReadClient,
  groupId: string
): Promise<ReadResult<CareNotesRow[]>> {
  if (!isUuid(groupId)) return { data: [], error: null };
  const { data, error } = await client
    .from("care_notes")
    .select(CARE_NOTE_COLUMNS)
    .eq("subject_group_id", groupId)
    .order("created_at", { ascending: false });
  if (error)
    return { data: null, error: wrapError("fetchGroupCareNotes", error) };
  return { data: (data ?? []) as CareNotesRow[], error: null };
}

export async function fetchGroupPrayerRequests(
  client: ReadClient,
  groupId: string
): Promise<ReadResult<PrayerRequestsRow[]>> {
  if (!isUuid(groupId)) return { data: [], error: null };
  const { data, error } = await client
    .from("prayer_requests")
    .select(PRAYER_REQUEST_COLUMNS)
    .eq("subject_group_id", groupId)
    .order("created_at", { ascending: false });
  if (error)
    return {
      data: null,
      error: wrapError("fetchGroupPrayerRequests", error),
    };
  return { data: (data ?? []) as PrayerRequestsRow[], error: null };
}

// Pivot slice 11 (#382 / ADR 0020): the GROUP notes a leader AUTHORED, newest
// first — the admin peek path for the leader-detail view. RLS gates these on the
// AUTHOR's transparency grant (the leader is the author of a group note), so the
// oversight ladder reads them only when that leader's toggle is on; off = the
// query returns nothing by construction. Filtered to group-subject rows so this
// never returns the OS-authored, subject-keyed notes.
export async function fetchAuthoredGroupCareNotes(
  client: ReadClient,
  authorProfileId: string
): Promise<ReadResult<CareNotesRow[]>> {
  if (!isUuid(authorProfileId)) return { data: [], error: null };
  const { data, error } = await client
    .from("care_notes")
    .select(CARE_NOTE_COLUMNS)
    .eq("author_profile_id", authorProfileId)
    .not("subject_group_id", "is", null)
    .order("created_at", { ascending: false });
  if (error)
    return {
      data: null,
      error: wrapError("fetchAuthoredGroupCareNotes", error),
    };
  return { data: (data ?? []) as CareNotesRow[], error: null };
}

export async function fetchAuthoredGroupPrayerRequests(
  client: ReadClient,
  authorProfileId: string
): Promise<ReadResult<PrayerRequestsRow[]>> {
  if (!isUuid(authorProfileId)) return { data: [], error: null };
  const { data, error } = await client
    .from("prayer_requests")
    .select(PRAYER_REQUEST_COLUMNS)
    .eq("author_profile_id", authorProfileId)
    .not("subject_group_id", "is", null)
    .order("created_at", { ascending: false });
  if (error)
    return {
      data: null,
      error: wrapError("fetchAuthoredGroupPrayerRequests", error),
    };
  return { data: (data ?? []) as PrayerRequestsRow[], error: null };
}

// The per-subject transparency grant (admin-only by RLS). Returns null when no
// grant row exists — the toggle defaults to DENIED (sealed) in that case.
export async function fetchNoteTransparencyGrant(
  client: ReadClient,
  subjectProfileId: string
): Promise<ReadResult<NoteTransparencyGrantsRow | null>> {
  if (!isUuid(subjectProfileId)) return { data: null, error: null };
  const { data, error } = await client
    .from("note_transparency_grants")
    .select(NOTE_TRANSPARENCY_GRANT_COLUMNS)
    .eq("subject_profile_id", subjectProfileId)
    .maybeSingle();
  if (error)
    return {
      data: null,
      error: wrapError("fetchNoteTransparencyGrant", error),
    };
  return {
    data: (data as NoteTransparencyGrantsRow | null) ?? null,
    error: null,
  };
}
