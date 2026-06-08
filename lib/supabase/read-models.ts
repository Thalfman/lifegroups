import type {
  AppSettingsRow,
  AttendanceRecordsRow,
  AttendanceSessionsRow,
  ChurchAttendanceSnapshotsRow,
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
  PlatformConfigRow,
  ProfilesRow,
} from "@/types/database";
import type {
  GroupAudienceCategory,
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

// A group reference is the id, name, and lifecycle status — enough to list
// active groups (e.g. a candidate/apprentice picker) without pulling the full
// row's privacy-sensitive columns (e.g. admin_notes). Prefer this over
// fetchAllGroups on read paths that only need to identify active groups.
export type GroupRef = Pick<GroupsRow, "id" | "name" | "lifecycle_status">;

export async function fetchGroupRefs(
  client: ReadClient
): Promise<ReadResult<GroupRef[]>> {
  const { data, error } = await client
    .from("groups")
    .select("id, name, lifecycle_status")
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
    .select("*")
    .in("id", ids)
    .order("name", { ascending: true });
  if (error) return { data: null, error: wrapError("fetchGroupsByIds", error) };
  return { data: data ?? [], error: null };
}

// Leader-safe group read: an ALLOWLISTED projection that excludes admin-only
// columns (notably `admin_notes`, see AGENTS.md — admin notes must never reach a
// leader route). The leader surfaces (dashboard, care, calendar) read their own
// groups via the group RLS `auth_is_leader_of(id)` arm, so a plain `select("*")`
// (fetchGroupsByIds) would pull admin_notes into a leader context. Leaders only
// ever need identity + schedule, so this returns exactly those columns.
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
  "notes, successor_designate, meeting_time, leader_pipeline_id, " +
  "manual_member_count, archived_at, " +
  "created_by, updated_by, created_at, updated_at";

export type MultiplicationCandidateGroup = Pick<
  GroupsRow,
  "id" | "name" | "audience_category" | "launched_on" | "lifecycle_status"
> & {
  // #398: the group's category label, resolved from category_id →
  // group_categories.label. null = Uncategorized (no category, or its category
  // was archived). Replaces the retired life_stage field as the segmentation
  // axis the planner buckets by.
  category_label: string | null;
};

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
          "id, name, audience_category, category_id, launched_on, lifecycle_status"
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

  // #398: resolve each group's category_id to its catalog label so the planner
  // buckets by audience × category label. Batch-read the referenced categories
  // (one extra round-trip keyed by the distinct category ids) and map id →
  // label; a null/absent/archived category resolves to null = Uncategorized.
  type GroupCategoryProjection = {
    id: string;
    audience_category: GroupAudienceCategory | null;
    category_id: string | null;
    launched_on: string | null;
    lifecycle_status: GroupsRow["lifecycle_status"];
    name: string;
  };
  const groupRows = (groupsRes.data ?? []) as GroupCategoryProjection[];
  const categoryIds = [
    ...new Set(
      groupRows
        .map((g) => g.category_id)
        .filter((id): id is string => id != null)
    ),
  ];
  const categoryLabelById = new Map<string, string>();
  if (categoryIds.length > 0) {
    const categoriesRes = await client
      .from("group_categories")
      .select("id, label")
      .in("id", categoryIds)
      .is("archived_at", null);
    if (categoriesRes.error) {
      return {
        data: null,
        error: wrapError(
          "fetchMultiplicationCandidatesForAdmin/categories",
          categoriesRes.error
        ),
      };
    }
    for (const c of (categoriesRes.data ?? []) as {
      id: string;
      label: string;
    }[]) {
      categoryLabelById.set(c.id, c.label);
    }
  }

  const groupById = new Map<string, MultiplicationCandidateGroup>();
  for (const g of groupRows) {
    groupById.set(g.id, {
      id: g.id,
      name: g.name,
      audience_category: g.audience_category,
      launched_on: g.launched_on,
      lifecycle_status: g.lifecycle_status,
      category_label: g.category_id
        ? (categoryLabelById.get(g.category_id) ?? null)
        : null,
    });
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
  // #398: group id → resolved category label (from category_id →
  // group_categories.label), so the board's segment is audience × category
  // label. A group with no/archived category is simply absent (= Uncategorized).
  categoryLabelByGroup: Record<string, string>;
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
    categoryLabelByGroup: {},
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
      // #398: each group's category id, to resolve the board's segment label.
      client.from("groups").select("id, category_id"),
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

  // #398: resolve each group's category_id to its catalog label (live
  // categories only) so the board buckets by audience × category label.
  const categoryLabelByGroup: Record<string, string> = {};
  const groupRows = (groupsRes.data ?? []) as {
    id: string;
    category_id: string | null;
  }[];
  const boardCategoryIds = [
    ...new Set(
      groupRows
        .map((g) => g.category_id)
        .filter((id): id is string => id != null)
    ),
  ];
  if (boardCategoryIds.length > 0) {
    const categoriesRes = await client
      .from("group_categories")
      .select("id, label")
      .in("id", boardCategoryIds)
      .is("archived_at", null);
    if (categoriesRes.error) {
      return {
        ...empty,
        error: wrapError(
          "fetchCapacityBoardExtras/categories",
          categoriesRes.error
        ).message,
      };
    }
    const labelById = new Map<string, string>();
    for (const c of (categoriesRes.data ?? []) as {
      id: string;
      label: string;
    }[]) {
      labelById.set(c.id, c.label);
    }
    for (const g of groupRows) {
      if (g.category_id && labelById.has(g.category_id)) {
        categoryLabelByGroup[g.id] = labelById.get(g.category_id)!;
      }
    }
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
    categoryLabelByGroup,
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
