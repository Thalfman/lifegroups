import type { AppSupabaseClient } from "./types";
import type {
  AppSettingsRow,
  AttendanceRecordsRow,
  AttendanceSessionsRow,
  AuditEventsRow,
  FollowUpsRow,
  GroupHealthUpdatesRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  GuestsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";
import type {
  FollowUpStatus,
  GuestPipelineStage,
  MembershipStatus,
  ProfileStatus,
  UserRole,
} from "@/types/enums";

type ReadClient = AppSupabaseClient;

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

export async function fetchGroupsByIds(
  client: ReadClient,
  ids: string[],
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
  // Widen past the PostgREST default 1000-row cap (see GUEST_PAGE_LIMIT note
  // below). A week-wide admin review across many groups can approach the cap
  // even at modest deployment sizes; explicit range keeps results stable.
  const { data, error } = await client
    .from("attendance_records")
    .select("*")
    .in("session_id", sessionIds)
    .range(0, 9999);
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
  options: { groupId?: string; limit?: number } = {},
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
  if (error) return { data: null, error: wrapError("fetchOpenFollowUps", error) };
  return { data: data ?? [], error: null };
}

export async function fetchLatestHealthUpdates(
  client: ReadClient,
  options: { groupId?: string; updateWeek?: string } = {},
): Promise<ReadResult<GroupHealthUpdatesRow[]>> {
  let query = client
    .from("group_health_updates")
    .select("*")
    .order("update_week", { ascending: false });
  if (options.groupId) query = query.eq("group_id", options.groupId);
  if (options.updateWeek) query = query.eq("update_week", options.updateWeek);
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

export async function fetchAssignedGroupIdsForProfile(
  client: ReadClient,
  profileId: string,
): Promise<ReadResult<string[]>> {
  const { data, error } = await client
    .from("group_leaders")
    .select("group_id")
    .eq("profile_id", profileId)
    .eq("active", true)
    .returns<Pick<GroupLeadersRow, "group_id">[]>();
  if (error) return { data: null, error: wrapError("fetchAssignedGroupIdsForProfile", error) };
  return { data: (data ?? []).map((row) => row.group_id), error: null };
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

// ----- Admin-scoped readers (Phase 5A.1). RLS already permits these for
// super_admin / ministry_admin / staff_viewer via the Phase 4 policies.
// -------------------------------------------------------------------------

export async function fetchProfilesForAdmin(
  client: ReadClient,
  options: { roles?: UserRole[]; statuses?: ProfileStatus[] } = {},
): Promise<ReadResult<ProfilesRow[]>> {
  let query = client.from("profiles").select("*").order("full_name", { ascending: true });
  if (options.roles && options.roles.length > 0) query = query.in("role", options.roles);
  if (options.statuses && options.statuses.length > 0)
    query = query.in("status", options.statuses);
  const { data, error } = await query;
  if (error) return { data: null, error: wrapError("fetchProfilesForAdmin", error) };
  return { data: data ?? [], error: null };
}

export async function fetchAllMembers(
  client: ReadClient,
  options: { statuses?: MembershipStatus[] } = {},
): Promise<ReadResult<MembersRow[]>> {
  let query = client.from("members").select("*").order("full_name", { ascending: true });
  if (options.statuses && options.statuses.length > 0)
    query = query.in("status", options.statuses);
  const { data, error } = await query;
  if (error) return { data: null, error: wrapError("fetchAllMembers", error) };
  return { data: data ?? [], error: null };
}

export async function fetchAllGroupLeaders(
  client: ReadClient,
  options: { activeOnly?: boolean } = {},
): Promise<ReadResult<GroupLeadersRow[]>> {
  let query = client.from("group_leaders").select("*");
  if (options.activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) return { data: null, error: wrapError("fetchAllGroupLeaders", error) };
  return { data: data ?? [], error: null };
}

// Phase 5A.4: Settings readers.

// Returns the single `metric_defaults` row from `app_settings`. The row is
// seeded by the Phase 5A.4 migration and never deleted; a `null` return
// here means either Supabase rejected the read or the row was manually
// removed. Callers should treat null as "use built-in defaults".
export async function fetchMetricDefaults(
  client: ReadClient,
): Promise<ReadResult<AppSettingsRow | null>> {
  const { data, error } = await client
    .from("app_settings")
    .select("*")
    .eq("setting_key", "metric_defaults")
    .maybeSingle();
  if (error) return { data: null, error: wrapError("fetchMetricDefaults", error) };
  return { data: (data as AppSettingsRow | null) ?? null, error: null };
}

// Returns every row in group_metric_settings. RLS on the table restricts
// reads to super_admin / ministry_admin, so calling this from any
// non-admin context will surface as an empty result. Admin pages call
// this once at load time and join client-side by group_id.
export async function fetchAllGroupMetricSettings(
  client: ReadClient,
): Promise<ReadResult<GroupMetricSettingsRow[]>> {
  const { data, error } = await client.from("group_metric_settings").select("*");
  if (error)
    return { data: null, error: wrapError("fetchAllGroupMetricSettings", error) };
  return { data: data ?? [], error: null };
}

export async function fetchGroupMetricSettings(
  client: ReadClient,
  groupId: string,
): Promise<ReadResult<GroupMetricSettingsRow | null>> {
  const { data, error } = await client
    .from("group_metric_settings")
    .select("*")
    .eq("group_id", groupId)
    .maybeSingle();
  if (error)
    return { data: null, error: wrapError("fetchGroupMetricSettings", error) };
  return { data: (data as GroupMetricSettingsRow | null) ?? null, error: null };
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
export async function fetchFollowUpsForAdmin(
  client: ReadClient,
  options: { statuses?: FollowUpStatus[]; limit?: number } = {},
): Promise<ReadResult<FollowUpsRow[]>> {
  let query = client
    .from("follow_ups")
    .select("*")
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (options.statuses && options.statuses.length > 0) {
    query = query.in("status", options.statuses);
  }
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query.range(0, 9999);
  if (error) return { data: null, error: wrapError("fetchFollowUpsForAdmin", error) };
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
  options: { profileId: string; assignedGroupIds: readonly string[] },
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
  guestIds: string[],
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
    counts.set(row.related_guest_id, (counts.get(row.related_guest_id) ?? 0) + 1);
  }
  return { data: counts, error: null };
}

// Returns { id, full_name } for guests the caller can see via RLS. Leaders
// only see guests tied to a group they lead; admins see all. The UI uses
// the returned set to render guest names on follow-up cards safely (any
// guest id missing from the set is rendered as "Guest" without a name).
export async function fetchGuestNamesByIds(
  client: ReadClient,
  guestIds: string[],
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
  options: { limit?: number; actionsLike?: string | string[] } = {},
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
              new Error(`unsafe actionsLike pattern: ${pat}`),
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
  if (error) return { data: null, error: wrapError("fetchRecentAuditEvents", error) };
  return { data: data ?? [], error: null };
}
