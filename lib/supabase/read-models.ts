import type { AppSupabaseClient } from "./types";
import type {
  AppSettingsRow,
  AttendanceRecordsRow,
  AttendanceSessionsRow,
  AuditEventsRow,
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
  OverShepherdsRow,
  PlatformConfigRow,
  ProfilesRow,
  ShepherdCareFollowUpsRow,
  ShepherdCareInteractionsRow,
  ShepherdCareProfilesRow,
  ShepherdCoverageAssignmentsRow,
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
import { pgHexToBase64 } from "@/lib/crypto/encoding";
import {
  BUILT_IN_CARE_CADENCE_WINDOWS,
  coverageTierForShepherd,
  staleWindowDaysForTier,
  type CareCadenceWindows,
} from "@/lib/admin/shepherd-care-cadence";

type ReadClient = AppSupabaseClient;

export type ReadResult<T> =
  | { data: T; error: null }
  | { data: null; error: Error };

function wrapError(prefix: string, err: unknown): Error {
  if (err instanceof Error) return new Error(`${prefix}: ${err.message}`);
  return new Error(`${prefix}: ${String(err)}`);
}

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
// Phase 5D.0 — Shepherd care tracker (admin-only) read models.
// ---------------------------------------------------------------------------

/**
 * Admin-only column allowlist for shepherd_care_profiles. Used by every
 * shepherd-care reader so `select("*")` never leaks here. The table-level
 * RLS already restricts SELECT to super_admin / ministry_admin;
 * this allowlist is the defensive belt-and-braces.
 *
 * admin_summary is NOT a column here any more — phase_os5 moved it to the
 * fenced, admin-only shepherd_care_admin_notes table so RLS (not just the app
 * allowlist) keeps it off the over_shepherd coverage path. The admin
 * single-profile read re-attaches it from that table; see
 * `fetchShepherdCareProfileByShepherdId`.
 *
 * If you add a column, also extend `ShepherdCareProfilesRow` in
 * types/database.ts.
 */
export const SHEPHERD_CARE_PROFILE_COLUMNS =
  "id, shepherd_profile_id, current_status, last_contact_at, " +
  "next_touchpoint_due, archived_at, created_at, updated_at";

/**
 * Admin-only column allowlist for shepherd_care_interactions. Same
 * privacy posture as the profile constant above — never used outside an
 * admin code path.
 */
export const SHEPHERD_CARE_INTERACTION_COLUMNS =
  "id, care_profile_id, interaction_at, interaction_type, notes, " +
  "created_by_profile_id, created_at";

/**
 * Phase SC.4 private care notes. Creator-scoped column allowlists; never
 * select("*"). The body column is opaque AES-256-GCM ciphertext — the server
 * never holds plaintext or the key. Both readers run behind requireAdmin() and
 * filter on created_by_profile_id (belt-and-braces with the creator-scoped RLS
 * that excludes super_admin). No leader / co_leader / over_shepherd /
 * super_admin read path exists.
 */
export const SHEPHERD_CARE_PRIVATE_NOTE_COLUMNS =
  "id, care_profile_id, created_by_profile_id, ciphertext, iv, dek_version, " +
  "created_at, updated_at";

export const SHEPHERD_CARE_KEY_SLOT_COLUMNS =
  "id, created_by_profile_id, dek_version, slot_type, credential_id, label, " +
  "prf_salt, hkdf_salt, wrapped_dek, wrap_iv, created_at";

// Read-shape DTOs. The bytea columns arrive from PostgREST in hex output and
// are normalised to base64 here so the whole app/client layer speaks one
// encoding (see lib/crypto/encoding.ts).
export type PrivateNoteCiphertext = {
  id: string;
  care_profile_id: string;
  created_by_profile_id: string;
  ciphertext: string; // base64
  iv: string; // base64
  dek_version: number;
  created_at: string;
  updated_at: string;
};

export type PrivateNoteKeySlot = {
  id: string;
  created_by_profile_id: string;
  dek_version: number;
  slot_type: "passkey" | "recovery";
  credential_id: string | null; // base64
  label: string | null;
  prf_salt: string | null; // base64
  hkdf_salt: string; // base64
  wrapped_dek: string; // base64
  wrap_iv: string; // base64
  created_at: string;
};

// PostgREST default bytea output is hex ("\\x..."); some deployments emit
// base64. Normalise hex to base64 and pass an already-base64 value through.
function byteaToBase64(value: string): string {
  return value.startsWith("\\x") || value.startsWith("\\X")
    ? pgHexToBase64(value)
    : value;
}

function nullableByteaToBase64(value: string | null): string | null {
  return value === null || value === undefined ? null : byteaToBase64(value);
}

/**
 * Conservative days-since-last-contact fallback for the "needs attention"
 * filter when no per-tier window is supplied. Julian Q5 replaced the former
 * single window with two tier-keyed windows (see lib/admin/shepherd-care-cadence
 * and app_settings.metric_defaults.shepherd_care_stale_days_{direct,delegated}).
 * This equals the longer (delegated) default so a caller without coverage
 * context never over-flags.
 */
export const SHEPHERD_CARE_STALE_DAYS =
  BUILT_IN_CARE_CADENCE_WINDOWS.delegatedStaleDays;

/**
 * UTC-anchored YYYY-MM-DD string for "today", used by every shepherd-care
 * read/composition path so date math (stale window, overdue touchpoints,
 * upcoming window) stays consistent across server timezones.
 */
export function currentUtcDateIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
}

// Directory cards never render the admin_summary, so omit it from the
// projected care row to keep the response payload small and avoid
// shipping note bodies anywhere the directory is rendered.
export type ShepherdCareDirectorySummary = Pick<
  ShepherdCareProfilesRow,
  | "id"
  | "shepherd_profile_id"
  | "current_status"
  | "last_contact_at"
  | "next_touchpoint_due"
  | "archived_at"
  | "created_at"
  | "updated_at"
>;

// Exported so the coverage-scoped Over-Shepherd reader projects the exact same
// (admin_summary-free) care columns from one source of truth, rather than
// maintaining a byte-identical copy.
export const SHEPHERD_CARE_DIRECTORY_COLUMNS =
  "id, shepherd_profile_id, current_status, last_contact_at, " +
  "next_touchpoint_due, archived_at, created_at, updated_at";

export type ShepherdCareDirectoryEntry = {
  profile: Pick<ProfilesRow, "id" | "full_name" | "email" | "role" | "status">;
  care: ShepherdCareDirectorySummary | null;
  needs_attention: boolean;
};

/**
 * Join a set of directory profiles with their care rows in TS (so a profile
 * with no care row still appears as "needs first contact") and stamp each
 * entry's needs_attention. Shared by the admin directory and the coverage-
 * scoped Over-Shepherd directory so the assembly + needs_attention wiring
 * lives in one place. Both callers pre-scope which profiles/care rows they
 * read; this only assembles.
 *
 * Julian Q5: needs_attention now uses the per-tier staleness window. A
 * shepherd in `delegatedShepherdIds` (an active over-shepherd assignment) is
 * delegated (longer window); otherwise directly-overseen (shorter window).
 * Omitting `delegatedShepherdIds` treats every shepherd as delegated — the
 * conservative longer window — which is exactly right for the Over-Shepherd
 * surface (every covered shepherd is delegated by definition) and avoids
 * over-flagging when coverage context is unavailable.
 */
export function buildCareDirectoryEntries(
  profiles: Pick<
    ProfilesRow,
    "id" | "full_name" | "email" | "role" | "status"
  >[],
  careRows: ShepherdCareDirectorySummary[],
  options: {
    todayIso?: string;
    windows?: CareCadenceWindows;
    delegatedShepherdIds?: ReadonlySet<string>;
  } = {}
): ShepherdCareDirectoryEntry[] {
  const careByShepherdId = new Map<string, ShepherdCareDirectorySummary>();
  for (const row of careRows)
    careByShepherdId.set(row.shepherd_profile_id, row);

  const today = options.todayIso ?? currentUtcDateIso();
  const windows = options.windows ?? BUILT_IN_CARE_CADENCE_WINDOWS;
  const delegatedShepherdIds = options.delegatedShepherdIds;

  return profiles.map((profile) => {
    const care = careByShepherdId.get(profile.id) ?? null;
    const hasActiveOverShepherd = delegatedShepherdIds
      ? delegatedShepherdIds.has(profile.id)
      : true;
    const staleDays = staleWindowDaysForTier(
      coverageTierForShepherd(hasActiveOverShepherd),
      windows
    );
    return {
      profile,
      care,
      needs_attention: computeNeedsAttention(care, today, staleDays),
    };
  });
}

export function differenceInDaysIso(today: string, then: string): number {
  // Both inputs are YYYY-MM-DD; Date.parse with the ISO string at midnight UTC
  // is stable across server timezones. Truncate the result to whole days.
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${then}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.floor((a - b) / 86_400_000);
}

export function computeNeedsAttention(
  care: ShepherdCareDirectorySummary | null,
  todayIso: string,
  staleDays: number = SHEPHERD_CARE_STALE_DAYS
): boolean {
  if (care === null) return true;
  // Julian Q2 (#122): the action-required care statuses (`concern`,
  // `needs_follow_up`) raise an attention-queue reason on their own, so they
  // must also drive the "Needs attention" count + directory filter — otherwise
  // a shepherd marked `concern` with recent contact shows in the triage queue
  // while the chip reads 0 and the filter hides the same row. `needs_encouragement`
  // is a soft nudge (queue-only, lowest priority) and is deliberately excluded
  // here; `inactive` is a lifecycle state, not an attention signal.
  if (
    care.current_status === "concern" ||
    care.current_status === "needs_follow_up"
  ) {
    return true;
  }
  if (care.last_contact_at === null) return true;
  if (
    care.next_touchpoint_due !== null &&
    care.next_touchpoint_due < todayIso
  ) {
    return true;
  }
  if (differenceInDaysIso(todayIso, care.last_contact_at) > staleDays) {
    return true;
  }
  return false;
}

/**
 * Admin-only directory of leader / co_leader profiles joined with the
 * matching shepherd_care_profiles row (or null when no care row exists
 * yet). The join is computed in TS so leaders with no care row still
 * appear in the directory as "needs first contact".
 */
export async function fetchShepherdCareDirectoryForAdmin(
  client: ReadClient,
  options: {
    todayIso?: string;
    windows?: CareCadenceWindows;
    // Julian Q5: the shepherds with an active over-shepherd assignment (the
    // delegated tier, longer window); anyone else is directly-overseen
    // (shorter window). The caller passes the SAME active-coverage set the
    // dashboard uses, so the directory's needs_attention can never disagree
    // with the queue. Omitted => every shepherd is treated as delegated (the
    // conservative longer window), which is also exactly right for callers
    // where every shepherd is delegated by definition.
    delegatedShepherdIds?: ReadonlySet<string>;
  } = {}
): Promise<ReadResult<ShepherdCareDirectoryEntry[]>> {
  const profilesQuery = await client
    .from("profiles")
    .select("id, full_name, email, role, status")
    .in("role", ["leader", "co_leader"])
    .eq("status", "active")
    .order("full_name", { ascending: true });
  if (profilesQuery.error) {
    return {
      data: null,
      error: wrapError(
        "fetchShepherdCareDirectoryForAdmin/profiles",
        profilesQuery.error
      ),
    };
  }

  const shepherdIds = (profilesQuery.data ?? []).map(
    (p) => (p as { id: string }).id
  );

  // Filter care rows down to the visible shepherd ids so the response
  // doesn't ship every care row in the database to the directory page.
  // Skipping the fetch entirely when there are no shepherd ids keeps
  // the PostgREST `.in("col", [])` edge case off the wire.
  let careRows: ShepherdCareDirectorySummary[] = [];
  if (shepherdIds.length > 0) {
    const careQuery = await client
      .from("shepherd_care_profiles")
      .select(SHEPHERD_CARE_DIRECTORY_COLUMNS)
      .in("shepherd_profile_id", shepherdIds);
    if (careQuery.error) {
      return {
        data: null,
        error: wrapError(
          "fetchShepherdCareDirectoryForAdmin/care",
          careQuery.error
        ),
      };
    }
    careRows = (careQuery.data ?? []) as ShepherdCareDirectorySummary[];
  }

  const profiles = (profilesQuery.data ?? []) as Pick<
    ProfilesRow,
    "id" | "full_name" | "email" | "role" | "status"
  >[];

  return {
    data: buildCareDirectoryEntries(profiles, careRows, {
      todayIso: options.todayIso,
      windows: options.windows,
      delegatedShepherdIds: options.delegatedShepherdIds,
    }),
    error: null,
  };
}

/**
 * Admin-only single-profile read keyed by the LEADER's profile id (not
 * the care_profile row id). Returns null when no care row exists yet —
 * the caller renders the page in "needs first contact" state.
 */
export async function fetchShepherdCareProfileByShepherdId(
  client: ReadClient,
  shepherdProfileId: string
): Promise<ReadResult<ShepherdCareProfilesRow | null>> {
  const { data, error } = await client
    .from("shepherd_care_profiles")
    .select(SHEPHERD_CARE_PROFILE_COLUMNS)
    .eq("shepherd_profile_id", shepherdProfileId)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError("fetchShepherdCareProfileByShepherdId", error),
    };
  }
  if (data === null || data === undefined) return { data: null, error: null };

  // admin_summary now lives in the fenced, admin-only shepherd_care_admin_notes
  // table (phase_os5). Re-attach it here for the admin detail surface; this
  // read only runs behind requireAdmin(), and the notes table's admin-only RLS
  // keeps it off any non-admin path even if this read is reused.
  const base = data as Omit<ShepherdCareProfilesRow, "admin_summary">;
  const note = await client
    .from("shepherd_care_admin_notes")
    .select("admin_summary")
    .eq("care_profile_id", base.id)
    .maybeSingle();
  if (note.error) {
    return {
      data: null,
      error: wrapError(
        "fetchShepherdCareProfileByShepherdId/admin_notes",
        note.error
      ),
    };
  }
  const admin_summary =
    (note.data as { admin_summary?: string | null } | null)?.admin_summary ??
    null;
  return { data: { ...base, admin_summary }, error: null };
}

/**
 * Admin-only interaction history for one care profile. Append-only
 * ordering: most recent first by `interaction_at`, tiebreak by
 * `created_at` so multiple touches on the same day stay stable.
 */
export async function fetchShepherdCareInteractionsForAdmin(
  client: ReadClient,
  careProfileId: string
): Promise<ReadResult<ShepherdCareInteractionsRow[]>> {
  const { data, error } = await client
    .from("shepherd_care_interactions")
    .select(SHEPHERD_CARE_INTERACTION_COLUMNS)
    .eq("care_profile_id", careProfileId)
    .order("interaction_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    return {
      data: null,
      error: wrapError("fetchShepherdCareInteractionsForAdmin", error),
    };
  }
  return {
    data: (data ?? []) as ShepherdCareInteractionsRow[],
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Phase SC.1B — Shepherd care follow-ups (admin-only task list) read models.
// ---------------------------------------------------------------------------

/**
 * Admin-only column allowlist for shepherd_care_follow_ups. Same privacy
 * posture as the SC.1A care constants above — never used outside an admin
 * code path, and `select("*")` never appears on care tables. The table-level
 * RLS already restricts SELECT to super_admin / ministry_admin and admits no
 * over_shepherd / leader read path; this allowlist is the defensive belt-and-
 * braces.
 *
 * Privacy contract: care follow-ups (incl. `title` and `notes` bodies) are
 * admin-only pastoral task content. They must NEVER be read on a leader,
 * over-shepherd, or aggregate-visible-to-another-tier path. There is
 * deliberately no leader/over-shepherd reader for this table.
 *
 * If you add a column, also extend `ShepherdCareFollowUpsRow` in
 * types/database.ts.
 */
export const SHEPHERD_CARE_FOLLOW_UP_COLUMNS =
  "id, care_profile_id, title, due_date, status, notes, " +
  "created_by_profile_id, created_at, updated_at, completed_at";

/**
 * Admin-only list of care follow-ups for one care profile. Returns the raw
 * rows in a stable order (outstanding before done, then soonest due date);
 * the urgency ordering / overdue bucketing the UI renders is computed by the
 * pure helpers in lib/admin/shepherd-care-follow-ups.ts from this set.
 */
export async function fetchShepherdCareFollowUpsForProfile(
  client: ReadClient,
  careProfileId: string
): Promise<ReadResult<ShepherdCareFollowUpsRow[]>> {
  const { data, error } = await client
    .from("shepherd_care_follow_ups")
    .select(SHEPHERD_CARE_FOLLOW_UP_COLUMNS)
    .eq("care_profile_id", careProfileId)
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) {
    return {
      data: null,
      error: wrapError("fetchShepherdCareFollowUpsForProfile", error),
    };
  }
  return { data: (data ?? []) as ShepherdCareFollowUpsRow[], error: null };
}

// Minimal cross-profile projection the SC.3 dashboard needs to surface
// overdue/open care follow-ups. EXCLUDES title / notes bodies — the
// dashboard only counts and buckets by status + due date, then links to the
// per-shepherd detail page for the task content.
export type CareFollowUpDashboardRow = {
  care_profile_id: string;
  status: ShepherdCareFollowUpsRow["status"];
  due_date: string | null;
};

/**
 * Admin-only feed of every OUTSTANDING (not-done) care follow-up across all
 * profiles, used by the SC.3 dashboard to roll up overdue/open tasks per
 * shepherd. Done rows are excluded at the database level (matches the
 * partial index) so the scan stays cheap. Note bodies are never projected.
 */
export async function fetchOutstandingCareFollowUpsForAdmin(
  client: ReadClient
): Promise<ReadResult<CareFollowUpDashboardRow[]>> {
  const { data, error } = await client
    .from("shepherd_care_follow_ups")
    .select("care_profile_id, status, due_date")
    .neq("status", "done")
    .range(0, 9999);
  if (error) {
    return {
      data: null,
      error: wrapError("fetchOutstandingCareFollowUpsForAdmin", error),
    };
  }
  return { data: (data ?? []) as CareFollowUpDashboardRow[], error: null };
}

/**
 * Count of OUTSTANDING generic `follow_ups` (open + in_progress) assigned to
 * a profile. Powers the one-way cross-link glance on the care detail page
 * (issue #107 story 20): the care UI may show how many generic follow-ups a
 * shepherd owns, WITHOUT the generic surface ever reading care tables. Uses a
 * head count so no follow-up bodies (incl. admin_private_note) leave the
 * server.
 */
export async function fetchGenericFollowUpCountForAssignee(
  client: ReadClient,
  profileId: string
): Promise<ReadResult<number>> {
  const { count, error } = await client
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", profileId)
    .in("status", ["open", "in_progress"]);
  if (error) {
    return {
      data: null,
      error: wrapError("fetchGenericFollowUpCountForAssignee", error),
    };
  }
  return { data: count ?? 0, error: null };
}

/**
 * Admin-only column allowlist for cross-shepherd recent interactions used by
 * the Julian dashboard. EXCLUDES `notes` — the dashboard surfaces shepherd
 * name, date, and interaction type only, then links to the per-shepherd
 * detail page for note bodies.
 *
 * Both joins are `!inner` so the role/status filters applied at query time
 * (active `leader` / `co_leader` only) prune rows whose shepherd has been
 * deactivated or moved off the eligible roles. Without this filter the feed
 * would link to detail pages that return 404 for those profiles.
 */
export const SHEPHERD_CARE_RECENT_INTERACTION_COLUMNS =
  "id, care_profile_id, interaction_at, interaction_type, created_at, " +
  "care_profile:shepherd_care_profiles!shepherd_care_interactions_care_profile_id_fkey!inner ( " +
  "shepherd_profile_id, " +
  "shepherd:profiles!shepherd_care_profiles_shepherd_profile_id_fkey!inner ( id, full_name, role, status ) " +
  ")";

export type ShepherdCareRecentInteractionRow = {
  id: string;
  care_profile_id: string;
  interaction_at: string;
  interaction_type: ShepherdCareInteractionsRow["interaction_type"];
  created_at: string;
  shepherd_profile_id: string;
  shepherd_full_name: string;
};

function projectRecentInteractionRows(
  rows: unknown[]
): ShepherdCareRecentInteractionRow[] {
  const out: ShepherdCareRecentInteractionRow[] = [];
  for (const r of rows as Array<{
    id: string;
    care_profile_id: string;
    interaction_at: string;
    interaction_type: ShepherdCareInteractionsRow["interaction_type"];
    created_at: string;
    care_profile:
      | {
          shepherd_profile_id: string;
          shepherd:
            | { id: string; full_name: string }
            | { id: string; full_name: string }[]
            | null;
        }
      | {
          shepherd_profile_id: string;
          shepherd:
            | { id: string; full_name: string }
            | { id: string; full_name: string }[]
            | null;
        }[]
      | null;
  }>) {
    const cp = Array.isArray(r.care_profile)
      ? (r.care_profile[0] ?? null)
      : r.care_profile;
    if (cp === null) continue;
    const shepherd = Array.isArray(cp.shepherd)
      ? (cp.shepherd[0] ?? null)
      : cp.shepherd;
    if (shepherd === null) continue;
    out.push({
      id: r.id,
      care_profile_id: r.care_profile_id,
      interaction_at: r.interaction_at,
      interaction_type: r.interaction_type,
      created_at: r.created_at,
      shepherd_profile_id: cp.shepherd_profile_id,
      shepherd_full_name: shepherd.full_name,
    });
  }
  return out;
}

/**
 * Admin-only cross-shepherd interactions feed used by the Julian dashboard.
 * Returns the most recent N interactions across every care profile, ordered
 * by `interaction_at desc` then `created_at desc`. Note bodies intentionally
 * excluded from the projection — surface them only on the detail page.
 */
export async function fetchRecentShepherdCareInteractionsForAdmin(
  client: ReadClient,
  options: { limit?: number } = {}
): Promise<ReadResult<ShepherdCareRecentInteractionRow[]>> {
  const limit = options.limit ?? 10;
  // Filters apply to the embedded inner-join columns, which excludes
  // interactions whose shepherd has been deactivated or moved off the
  // eligible roles. Matches the same belt-and-braces filter used by
  // fetchActiveShepherdCoverageAssignmentsForAdmin.
  const { data, error } = await client
    .from("shepherd_care_interactions")
    .select(SHEPHERD_CARE_RECENT_INTERACTION_COLUMNS)
    .eq("care_profile.shepherd.status", "active")
    .in(
      "care_profile.shepherd.role",
      ELIGIBLE_SHEPHERD_ROLES as unknown as string[]
    )
    .order("interaction_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    return {
      data: null,
      error: wrapError("fetchRecentShepherdCareInteractionsForAdmin", error),
    };
  }
  return {
    data: projectRecentInteractionRows((data ?? []) as unknown[]),
    error: null,
  };
}

/**
 * Single-profile lookup by leader profile id, used by the detail page to
 * resolve the leader's profile and validate role gating. Admin-only.
 */
export async function fetchAdminShepherdProfileById(
  client: ReadClient,
  shepherdProfileId: string
): Promise<
  ReadResult<Pick<
    ProfilesRow,
    "id" | "full_name" | "email" | "role" | "status"
  > | null>
> {
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, email, role, status")
    .eq("id", shepherdProfileId)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError("fetchAdminShepherdProfileById", error),
    };
  }
  if (data === null || data === undefined) return { data: null, error: null };
  return {
    data: data as Pick<
      ProfilesRow,
      "id" | "full_name" | "email" | "role" | "status"
    >,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Phase 5D.1 — Over-shepherd coverage tracking (SC.2).
// ---------------------------------------------------------------------------

/**
 * Admin-only column allowlist for over_shepherds list reads. EXCLUDES
 * `notes` — directory and summary cards never render note bodies, so
 * the column doesn't leave the server. Use OVER_SHEPHERD_DETAIL_COLUMNS
 * when loading a single record for the edit form.
 */
export const OVER_SHEPHERD_LIST_COLUMNS =
  "id, full_name, email, phone, active, archived_at, created_at, updated_at";

/**
 * Admin-only column allowlist that INCLUDES `notes`. Used only by the
 * over-shepherd edit form's loader.
 */
export const OVER_SHEPHERD_DETAIL_COLUMNS = `${OVER_SHEPHERD_LIST_COLUMNS}, notes`;

export const SHEPHERD_COVERAGE_ASSIGNMENT_COLUMNS =
  "id, shepherd_profile_id, over_shepherd_id, active, assigned_at, ended_at, created_at, updated_at";

export type OverShepherdListRow = Pick<
  OverShepherdsRow,
  | "id"
  | "full_name"
  | "email"
  | "phone"
  | "active"
  | "archived_at"
  | "created_at"
  | "updated_at"
>;

export type ActiveShepherdCoverageAssignmentSummary = Pick<
  ShepherdCoverageAssignmentsRow,
  "id" | "shepherd_profile_id" | "over_shepherd_id" | "assigned_at"
> & {
  over_shepherd: Pick<OverShepherdsRow, "id" | "full_name" | "active">;
};

/**
 * Admin-only list of over-shepherds. Excludes notes from the projection
 * so the directory and summary views never receive note bodies. RLS on
 * the table additionally restricts SELECT to super_admin / ministry_admin.
 */
export async function fetchOverShepherdsForAdmin(
  client: ReadClient,
  options: { includeArchived?: boolean } = {}
): Promise<ReadResult<OverShepherdListRow[]>> {
  let query = client
    .from("over_shepherds")
    .select(OVER_SHEPHERD_LIST_COLUMNS)
    .order("active", { ascending: false })
    .order("full_name", { ascending: true });
  if (!options.includeArchived) {
    query = query.eq("active", true);
  }
  const { data, error } = await query;
  if (error) {
    return {
      data: null,
      error: wrapError("fetchOverShepherdsForAdmin", error),
    };
  }
  return { data: (data ?? []) as OverShepherdListRow[], error: null };
}

/**
 * Admin-only single-record lookup including notes. Used only by the edit
 * form loader — list/directory paths must use fetchOverShepherdsForAdmin
 * (which omits notes).
 */
export async function fetchOverShepherdByIdForAdmin(
  client: ReadClient,
  overShepherdId: string
): Promise<ReadResult<OverShepherdsRow | null>> {
  const { data, error } = await client
    .from("over_shepherds")
    .select(OVER_SHEPHERD_DETAIL_COLUMNS)
    .eq("id", overShepherdId)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError("fetchOverShepherdByIdForAdmin", error),
    };
  }
  if (data === null || data === undefined) return { data: null, error: null };
  return { data: data as OverShepherdsRow, error: null };
}

function projectCoverageAssignmentRows(
  rows: unknown[]
): ActiveShepherdCoverageAssignmentSummary[] {
  const summaries: ActiveShepherdCoverageAssignmentSummary[] = [];
  for (const r of rows as Array<{
    id: string;
    shepherd_profile_id: string;
    over_shepherd_id: string;
    assigned_at: string;
    over_shepherd:
      | { id: string; full_name: string; active: boolean }
      | { id: string; full_name: string; active: boolean }[]
      | null;
  }>) {
    const embedded = Array.isArray(r.over_shepherd)
      ? (r.over_shepherd[0] ?? null)
      : r.over_shepherd;
    if (embedded === null) continue;
    summaries.push({
      id: r.id,
      shepherd_profile_id: r.shepherd_profile_id,
      over_shepherd_id: r.over_shepherd_id,
      assigned_at: r.assigned_at,
      over_shepherd: {
        id: embedded.id,
        full_name: embedded.full_name,
        active: embedded.active,
      },
    });
  }
  return summaries;
}

const ACTIVE_COVERAGE_WITH_OVER_SHEPHERD_SELECT =
  "id, shepherd_profile_id, over_shepherd_id, assigned_at, " +
  "over_shepherd:over_shepherds!shepherd_coverage_assignments_over_shepherd_id_fkey ( id, full_name, active ), " +
  "shepherd:profiles!shepherd_coverage_assignments_shepherd_profile_id_fkey!inner ( id, role, status )";

// Filter spec that excludes coverage rows whose shepherd has become
// ineligible (deactivated or role moved off leader/co_leader). The
// admin_deactivate_profile cascade in
// 20260518180000_phase5d1_over_shepherd_coverage_hardening.sql closes
// the row on deactivation, but role-change RPCs from earlier phases
// don't, so this read-side filter is the belt-and-braces.
const ELIGIBLE_SHEPHERD_ROLES = ["leader", "co_leader"] as const;

/**
 * Admin-only list of currently active coverage assignments, joined with
 * the active over-shepherd's display name. One row per active
 * shepherd_profile_id (enforced by the partial unique index in
 * 20260518170000_phase5d1_over_shepherd_coverage.sql). Callers key the
 * returned array by shepherd_profile_id in memory to avoid N+1 reads
 * from the directory page.
 */
export async function fetchActiveShepherdCoverageAssignmentsForAdmin(
  client: ReadClient
): Promise<ReadResult<ActiveShepherdCoverageAssignmentSummary[]>> {
  // The embedded `shepherd:profiles!...!inner` makes the join required,
  // and the `shepherd.status` / `shepherd.role` filters apply to the
  // joined row — so rows whose shepherd has been deactivated or moved
  // off leader/co_leader are excluded from the result.
  const { data, error } = await client
    .from("shepherd_coverage_assignments")
    .select(ACTIVE_COVERAGE_WITH_OVER_SHEPHERD_SELECT)
    .eq("active", true)
    .eq("shepherd.status", "active")
    .in("shepherd.role", ELIGIBLE_SHEPHERD_ROLES as unknown as string[]);
  if (error) {
    return {
      data: null,
      error: wrapError("fetchActiveShepherdCoverageAssignmentsForAdmin", error),
    };
  }
  return {
    data: projectCoverageAssignmentRows((data ?? []) as unknown[]),
    error: null,
  };
}

/**
 * Admin-only single-row lookup for the active coverage assignment of one
 * shepherd. Used by the per-shepherd detail page so it doesn't pay the
 * cost of scanning the whole assignments table. Returns null when no
 * active row exists.
 */
export async function fetchActiveShepherdCoverageAssignmentByShepherdId(
  client: ReadClient,
  shepherdProfileId: string
): Promise<ReadResult<ActiveShepherdCoverageAssignmentSummary | null>> {
  const { data, error } = await client
    .from("shepherd_coverage_assignments")
    .select(ACTIVE_COVERAGE_WITH_OVER_SHEPHERD_SELECT)
    .eq("shepherd_profile_id", shepherdProfileId)
    .eq("active", true)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError(
        "fetchActiveShepherdCoverageAssignmentByShepherdId",
        error
      ),
    };
  }
  if (data === null || data === undefined) return { data: null, error: null };
  const [summary] = projectCoverageAssignmentRows([data as unknown]);
  return { data: summary ?? null, error: null };
}

export type ShepherdCoveredByOverShepherd = {
  assignment: Pick<
    ShepherdCoverageAssignmentsRow,
    "id" | "shepherd_profile_id" | "over_shepherd_id" | "assigned_at"
  >;
  shepherd: Pick<ProfilesRow, "id" | "full_name">;
};

/**
 * Admin-only list of shepherds currently covered by one over-shepherd,
 * joined with the shepherd's display name. Filters at the database
 * level on `over_shepherd_id` + `active = true` so the over-shepherd
 * detail page doesn't pull every active assignment in the org.
 */
export async function fetchShepherdsCoveredByOverShepherdForAdmin(
  client: ReadClient,
  overShepherdId: string
): Promise<ReadResult<ShepherdCoveredByOverShepherd[]>> {
  // `!inner` makes the profiles join required; status/role filters
  // exclude shepherds who have been deactivated or moved off
  // leader/co_leader since their coverage row was created. Belt-and-
  // braces against role-change RPCs that don't yet cascade.
  const { data, error } = await client
    .from("shepherd_coverage_assignments")
    .select(
      "id, shepherd_profile_id, over_shepherd_id, assigned_at, " +
        "shepherd:profiles!shepherd_coverage_assignments_shepherd_profile_id_fkey!inner ( id, full_name, role, status )"
    )
    .eq("over_shepherd_id", overShepherdId)
    .eq("active", true)
    .eq("shepherd.status", "active")
    .in("shepherd.role", ELIGIBLE_SHEPHERD_ROLES as unknown as string[]);
  if (error) {
    return {
      data: null,
      error: wrapError("fetchShepherdsCoveredByOverShepherdForAdmin", error),
    };
  }
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    shepherd_profile_id: string;
    over_shepherd_id: string;
    assigned_at: string;
    shepherd:
      | { id: string; full_name: string; role: string; status: string }
      | { id: string; full_name: string; role: string; status: string }[]
      | null;
  }>;
  const out: ShepherdCoveredByOverShepherd[] = [];
  for (const r of rows) {
    const embedded = Array.isArray(r.shepherd)
      ? (r.shepherd[0] ?? null)
      : r.shepherd;
    if (embedded === null) continue;
    out.push({
      assignment: {
        id: r.id,
        shepherd_profile_id: r.shepherd_profile_id,
        over_shepherd_id: r.over_shepherd_id,
        assigned_at: r.assigned_at,
      },
      shepherd: { id: embedded.id, full_name: embedded.full_name },
    });
  }
  out.sort((a, b) => a.shepherd.full_name.localeCompare(b.shepherd.full_name));
  return { data: out, error: null };
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

// ----- Phase SC.4 — private care note readers -----------------------------

type RawPrivateNoteCiphertext = {
  id: string;
  care_profile_id: string;
  created_by_profile_id: string;
  ciphertext: string;
  iv: string;
  dek_version: number;
  created_at: string;
  updated_at: string;
};

type RawPrivateNoteKeySlot = {
  id: string;
  created_by_profile_id: string;
  dek_version: number;
  slot_type: "passkey" | "recovery";
  credential_id: string | null;
  label: string | null;
  prf_salt: string | null;
  hkdf_salt: string;
  wrapped_dek: string;
  wrap_iv: string;
  created_at: string;
};

/**
 * The calling admin's own private-note ciphertext for one care profile. Behind
 * requireAdmin(); creator-scoped RLS additionally guarantees a caller can only
 * read their own row. Returns ciphertext + iv normalised to base64.
 */
export async function fetchShepherdCarePrivateNoteCiphertextForCreator(
  client: ReadClient,
  careProfileId: string,
  creatorProfileId: string
): Promise<ReadResult<PrivateNoteCiphertext | null>> {
  const { data, error } = await client
    .from("shepherd_care_private_notes")
    .select(SHEPHERD_CARE_PRIVATE_NOTE_COLUMNS)
    .eq("care_profile_id", careProfileId)
    .eq("created_by_profile_id", creatorProfileId)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError(
        "fetchShepherdCarePrivateNoteCiphertextForCreator",
        error
      ),
    };
  }
  if (data === null || data === undefined) return { data: null, error: null };
  const row = data as RawPrivateNoteCiphertext;
  return {
    data: {
      id: row.id,
      care_profile_id: row.care_profile_id,
      created_by_profile_id: row.created_by_profile_id,
      ciphertext: byteaToBase64(row.ciphertext),
      iv: byteaToBase64(row.iv),
      dek_version: row.dek_version,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    error: null,
  };
}

/**
 * The calling admin's own wrapped-DEK key slots. Behind requireAdmin();
 * creator-scoped RLS additionally fences the slot table. Bytea fields
 * normalised to base64; recovery slots keep credential_id / prf_salt null.
 */
export async function fetchPrivateNoteKeySlotsForCreator(
  client: ReadClient,
  creatorProfileId: string
): Promise<ReadResult<PrivateNoteKeySlot[]>> {
  const { data, error } = await client
    .from("shepherd_care_note_key_slots")
    .select(SHEPHERD_CARE_KEY_SLOT_COLUMNS)
    .eq("created_by_profile_id", creatorProfileId)
    .order("created_at", { ascending: true });
  if (error) {
    return {
      data: null,
      error: wrapError("fetchPrivateNoteKeySlotsForCreator", error),
    };
  }
  const rows = (data ?? []) as RawPrivateNoteKeySlot[];
  return {
    data: rows.map((row) => ({
      id: row.id,
      created_by_profile_id: row.created_by_profile_id,
      dek_version: row.dek_version,
      slot_type: row.slot_type,
      credential_id: nullableByteaToBase64(row.credential_id),
      label: row.label,
      prf_salt: nullableByteaToBase64(row.prf_salt),
      hkdf_salt: byteaToBase64(row.hkdf_salt),
      wrapped_dek: byteaToBase64(row.wrapped_dek),
      wrap_iv: byteaToBase64(row.wrap_iv),
      created_at: row.created_at,
    })),
    error: null,
  };
}
