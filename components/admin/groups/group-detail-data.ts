import { createSupabaseServerClient } from "@/lib/supabase/server";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchActiveMemberships,
  fetchAllGroupLeaders,
  fetchAllMembers,
  fetchAttendanceSessions,
  fetchGroupCalendarEvents,
  fetchGroupMetricSettings,
  fetchGroupsByIds,
  fetchMembersByIds,
  fetchOpenFollowUps,
  fetchPlatformConfig,
  fetchProfilesForAdmin,
  type LeaderFollowUpRow,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import {
  fetchGroupHealthRatings,
  getGroupHealthOverviewForGroup,
  type GroupHealthOverviewRow,
} from "@/lib/admin/group-health-read";
import { decodeAppConfig } from "@/lib/admin/app-config-decode";
import { GROUP_HEALTH_COPY_KEYS, resolveCopy } from "@/lib/admin/editable-copy";
import {
  fetchProspectSignalsForGroup,
  type GroupProspectSignals,
} from "@/lib/supabase/prospect-reads";
import { isFrozenSurfaceLive } from "@/lib/admin/frozen-surface";
import {
  capacityStatus,
  decodeMetricDefaults,
  effectiveCapacity,
  effectiveCapacityFullPct,
  effectiveCapacityWarningPct,
  isExcludedFromCapacityMetrics,
} from "@/lib/admin/metrics";
import {
  capacityCategory,
  healthCategory,
  setupCategory,
} from "@/lib/dashboard/group-status";
import {
  lifecycleCategory,
  type GroupCapacityCategory,
  type GroupHealthCategory,
  type GroupLifecycleCategory,
  type GroupSetupCategory,
} from "@/lib/dashboard/labels";
import {
  generateOccurrencesInRange,
  mergeOverrides,
  toSavedOverrides,
  type ResolvedOccurrence,
} from "@/lib/calendar/occurrences";
import type { AttendanceSessionsRow, GroupsRow } from "@/types/database";
import type { GroupHealthLetter } from "@/types/enums";

// The group detail page's read-orchestration, as a pure function of a reads
// seam (ADR 0015). The page's tabs are URL-driven and each renders
// server-side with its own scoped reads, so the build loads the spine (the
// group row — subject resolution decides 404) plus ONLY the requested tab's
// reads. The fail-closed rules — null'd statuses when any status-feeding read
// failed, a null roster instead of an authoritative-looking empty one, the
// fail-closed events list when the override read failed — are functions of
// `GroupDetailReads`: production binds the live client through
// `supabaseGroupDetailReads`; a test binds an in-memory adapter satisfying the
// same interface. Two adapters, one seam.

export type GroupDetailTab =
  | "overview"
  | "people"
  | "health"
  | "attendance"
  | "follow-ups"
  | "events";

// Overview: the four independent status labels + meeting details. The labels
// are only trustworthy if every read that feeds them succeeded; on a failure
// `statuses` is null and the page fails closed with a notice rather than a
// confidently-wrong "Not assessed" / "Needs leader" / "Open".
export type GroupOverviewTabData = {
  tab: "overview";
  statuses: {
    lifecycle: GroupLifecycleCategory;
    setup: GroupSetupCategory;
    health: GroupHealthCategory;
    capacity: GroupCapacityCategory;
  } | null;
  // The live attendance read fell back to the last-saved grade — show the
  // grade but mark it so the letter isn't mistaken for a current reading.
  stale: boolean;
  // null when the memberships read failed (the page renders "—", never a
  // false zero).
  memberCount: number | null;
};

// People: the group's roster, now editable in place (assign / remove) rather
// than read-only with a hop to /admin/people. Each list is null when a read
// feeding it failed — a failed read must not render an empty roster as if
// authoritative — and the assignable options fail closed the same way (null →
// no assign control, degraded note instead).
export type GroupPeopleTabData = {
  tab: "people";
  // Archived (closed) groups get a read-only roster — restore first to edit.
  archived: boolean;
  leaders: Array<{
    id: string;
    // Drives the remove action (the row id alone can't — the RPC keys on the
    // (group, profile) pair).
    profileId: string;
    // null when the leader's profile row wasn't found (renders "(unknown)").
    name: string | null;
    isCoLeader: boolean;
  }> | null;
  members: Array<{ id: string; fullName: string }> | null;
  // Active leader/co-leader profiles not already on this group's roster, for
  // the inline assign control. null = the feeding read failed (or the group is
  // archived, where no assign control renders at all).
  assignableLeaders: Array<{ id: string; name: string }> | null;
  // Active members not already on this group's roster.
  assignableMembers: Array<{ id: string; name: string }> | null;
  // This group's Interest Funnel view (group-level only — prospects carry no
  // person FK). null = the read failed; the card shows a degraded note, never
  // a false "no prospects".
  prospectSignals: GroupProspectSignals | null;
};

// Health: the Group-Health Grade (Q12). Fails closed as a whole — a failed
// health/ratings read must not masquerade as a genuine "Not assessed" /
// "Not rated" grade.
export type GroupHealthTabData = {
  tab: "health";
  failed: boolean;
  period: string;
  health: GroupHealthCategory;
  grade: GroupHealthLetter | null;
  stale: boolean;
  attendancePct: number | null;
  attendanceWeeksCounted: number;
  spiritualGrowthScore: number | null;
  groupQuestionScore: number | null;
  // The full overview row the shared rating editor (GroupHealthEditorDrawer)
  // renders from — the same shape the triage list feeds it. null when the
  // health read failed or returned nothing: no row → no edit button, never an
  // editor over unknown values.
  editorRow: GroupHealthOverviewRow | null;
  // The operator-editable rating question wordings, resolved with the same
  // graceful placeholder fallback the triage uses (platform_config is
  // Super-Admin-only via RLS; a ministry admin reads the placeholders).
  spiritualGrowthLabel: string;
  groupQuestionLabel: string;
};

// Attendance: historical / read-only (the check-in flow is frozen per ADR
// 0002/0009). `sessions` is null when the read failed.
export type GroupAttendanceTabData = {
  tab: "attendance";
  checkInsLive: boolean;
  sessions: AttendanceSessionsRow[] | null;
};

// Follow-ups: open follow-ups related to this group. null = the read failed —
// not a confirmation that the group has none.
export type GroupFollowUpsTabData = {
  tab: "follow-ups";
  followUps: LeaderFollowUpRow[] | null;
};

// Events: upcoming occurrences generated from the group's schedule, merged
// with saved override rows. null = the override read failed; without it we
// cannot tell which generated occurrences were cancelled / retyped /
// retitled, so showing the un-overridden schedule would present stale dates
// as live meetings.
export type GroupEventsTabData = {
  tab: "events";
  occurrences: ResolvedOccurrence[] | null;
};

export type GroupDetailTabData =
  | GroupOverviewTabData
  | GroupPeopleTabData
  | GroupHealthTabData
  | GroupAttendanceTabData
  | GroupFollowUpsTabData
  | GroupEventsTabData;

export type GroupDetailData =
  | { kind: "not_found" }
  | { kind: "ok"; group: GroupsRow; tabData: GroupDetailTabData };

// The page-facing result: the pure build's union, plus the no-database case
// the load wrapper reports when Supabase env vars are absent.
export type GroupDetailResult = GroupDetailData | { kind: "db_unavailable" };

export type GroupDetailOptions = {
  groupId: string;
  tab: GroupDetailTab;
  // Current period month (YYYY-MM-01) for the overview/health grade reads.
  periodMonth: string;
  // Church-local today (YYYY-MM-DD), anchoring the events lookahead window.
  todayIso: string;
};

export type GroupDetailReads = {
  fetchGroupsByIds: OmitClient<typeof fetchGroupsByIds>;
  fetchAllGroupLeaders: OmitClient<typeof fetchAllGroupLeaders>;
  fetchAllMembers: OmitClient<typeof fetchAllMembers>;
  fetchActiveMemberships: OmitClient<typeof fetchActiveMemberships>;
  fetchMetricDefaults: OmitClient<typeof fetchMetricDefaultsCached>;
  fetchGroupMetricSettings: OmitClient<typeof fetchGroupMetricSettings>;
  fetchGroupHealthOverview: OmitClient<typeof getGroupHealthOverviewForGroup>;
  fetchPlatformConfig: OmitClient<typeof fetchPlatformConfig>;
  fetchProfilesForAdmin: OmitClient<typeof fetchProfilesForAdmin>;
  fetchMembersByIds: OmitClient<typeof fetchMembersByIds>;
  fetchGroupHealthRatings: OmitClient<typeof fetchGroupHealthRatings>;
  fetchAttendanceSessions: OmitClient<typeof fetchAttendanceSessions>;
  fetchOpenFollowUps: OmitClient<typeof fetchOpenFollowUps>;
  fetchGroupCalendarEvents: OmitClient<typeof fetchGroupCalendarEvents>;
  fetchProspectSignalsForGroup: OmitClient<typeof fetchProspectSignalsForGroup>;
  // Not a client-bound read-model fetcher: the ADR-0009 frozen-surface flag
  // for weekly check-ins (it fails safe to false on its own).
  fetchCheckInsLive: () => Promise<boolean>;
};

// Production adapter: binds the live Supabase client to every read this
// surface needs. The underlying fetchers keep their column selections.
export function supabaseGroupDetailReads(
  client: AppSupabaseClient
): GroupDetailReads {
  return {
    ...bindReads(client, {
      fetchGroupsByIds,
      fetchAllGroupLeaders,
      fetchAllMembers,
      fetchActiveMemberships,
      fetchMetricDefaults: fetchMetricDefaultsCached,
      fetchGroupMetricSettings,
      fetchGroupHealthOverview: getGroupHealthOverviewForGroup,
      fetchPlatformConfig,
      fetchProfilesForAdmin,
      fetchMembersByIds,
      fetchGroupHealthRatings,
      fetchAttendanceSessions,
      fetchOpenFollowUps,
      fetchGroupCalendarEvents,
      fetchProspectSignalsForGroup,
    }),
    fetchCheckInsLive: () => isFrozenSurfaceLive("check_ins"),
  };
}

// How far ahead the Events tab lists upcoming scheduled meetings. Groups on
// the normal recurring schedule have no saved override rows, so a plain row
// read returns nothing even though meetings are coming up; like the calendar
// surface, we GENERATE occurrences from the group's schedule for this window
// so the tab matches what the full calendar shows.
const EVENTS_LOOKAHEAD_DAYS = 56; // ~8 weeks

// Add a whole number of days to a YYYY-MM-DD date, UTC-anchored to avoid
// runtime-timezone drift (the calendar's own range helpers do the same).
function addDaysIso(iso: string, days: number): string {
  const anchor = new Date(`${iso}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

async function buildOverviewTab(
  reads: GroupDetailReads,
  group: GroupsRow,
  periodMonth: string
): Promise<GroupOverviewTabData> {
  const [leadersRes, membershipsRes, defaultsRes, healthRes, overrideRes] =
    await Promise.all([
      reads.fetchAllGroupLeaders({ activeOnly: true }),
      reads.fetchActiveMemberships({ groupId: group.id }),
      reads.fetchMetricDefaults(),
      // Targeted single-group health read (#308): runs the same grade
      // computation as the bulk overview but only for this group, so opening
      // one detail page no longer recomputes every active group.
      reads.fetchGroupHealthOverview(group.id, periodMonth),
      // Per-group metric overrides — resolved the SAME way the Groups list and
      // Settings do (defaults → per-group override precedence, ADR 0011) so
      // the detail capacity zone can't disagree with the list card.
      reads.fetchGroupMetricSettings(group.id),
    ]);

  // The four labels are only trustworthy if every read that feeds them
  // succeeded. On a failure, fail closed (statuses null → the page notice)
  // rather than rendering a confidently-wrong status.
  const statusFailed = Boolean(
    leadersRes.error ||
    membershipsRes.error ||
    defaultsRes.error ||
    overrideRes.error ||
    healthRes.error
  );
  const memberCount = membershipsRes.error
    ? null
    : (membershipsRes.data ?? []).length;
  const stale = healthRes.data?.stale ?? false;
  if (statusFailed) {
    return { tab: "overview", statuses: null, stale, memberCount };
  }

  const defaults = decodeMetricDefaults(defaultsRes.data ?? null);
  const override = overrideRes.data ?? null;
  const hasLeader = (leadersRes.data ?? []).some(
    (l) => l.group_id === group.id && l.active
  );
  const grade: GroupHealthLetter | null =
    healthRes.data?.computed_letter ?? null;

  const cap = effectiveCapacity(group, override, defaults);
  const status = capacityStatus({
    activeMemberCount: (membershipsRes.data ?? []).length,
    effectiveCapacity: cap,
    warningPct: effectiveCapacityWarningPct(override, defaults),
    fullPct: effectiveCapacityFullPct(defaults),
    excluded: isExcludedFromCapacityMetrics(override),
    allowOverCapacity: Boolean(override?.allow_over_capacity),
  });

  return {
    tab: "overview",
    statuses: {
      lifecycle: lifecycleCategory(group.lifecycle_status),
      setup: setupCategory({
        hasLeader,
        meetingDay: group.meeting_day,
        meetingTime: group.meeting_time,
        // Same resolved capacity the zone shows; null keeps the group in
        // Needs Setup.
        effectiveCapacity: cap,
      }),
      health: healthCategory(grade, defaults.group_health_watch_grade),
      capacity: capacityCategory(status),
    },
    stale,
    memberCount,
  };
}

async function buildPeopleTab(
  reads: GroupDetailReads,
  group: GroupsRow
): Promise<GroupPeopleTabData> {
  const archived = lifecycleCategory(group.lifecycle_status) === "archived";

  const [leadersRes, profilesRes, membershipsRes, allMembersRes, prospectsRes] =
    await Promise.all([
      reads.fetchAllGroupLeaders({ activeOnly: true }),
      reads.fetchProfilesForAdmin({ roles: ["leader", "co_leader"] }),
      reads.fetchActiveMemberships({ groupId: group.id }),
      // The full active-member pool feeds the inline assign control; skip the
      // read for an archived group, whose roster is read-only.
      archived
        ? Promise.resolve({ data: null, error: null })
        : reads.fetchAllMembers(),
      reads.fetchProspectSignalsForGroup(group.id),
    ]);

  const memberIds = (membershipsRes.data ?? []).map((m) => m.member_id);
  const membersRes = await reads.fetchMembersByIds(memberIds);

  // Fail closed per section: a failed read must not render an empty roster as
  // if authoritative (leader names come from the profiles read).
  const leadersFailed = Boolean(leadersRes.error || profilesRes.error);
  const membersFailed = Boolean(membershipsRes.error || membersRes.error);

  const profilesById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const leaders = leadersFailed
    ? null
    : (leadersRes.data ?? [])
        .filter((l) => l.group_id === group.id && l.active)
        .map((l) => ({
          id: l.id,
          profileId: l.profile_id,
          name: profilesById.get(l.profile_id)?.full_name ?? null,
          isCoLeader: l.role === "co_leader",
        }));
  // An active group_memberships link does not guarantee the member record is
  // still active (a deactivated member's link may not have been cleaned up),
  // so filter on members.status — matching the other roster surfaces — to
  // avoid overstating the active roster.
  const members = membersFailed
    ? null
    : (membersRes.data ?? [])
        .filter((m) => m.status === "active")
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .map((m) => ({ id: m.id, fullName: m.full_name }));

  // Assignable options for the inline controls. Fail closed: without a
  // trustworthy roster (or pool) the difference can't be computed, so the
  // assign control is suppressed rather than offering wrong choices. An
  // archived group skips options entirely (read-only roster).
  const assignedProfileIds = new Set(
    (leadersRes.data ?? [])
      .filter((l) => l.group_id === group.id && l.active)
      .map((l) => l.profile_id)
  );
  const assignableLeaders =
    archived || leadersFailed
      ? null
      : (profilesRes.data ?? [])
          .filter((p) => p.status === "active" && !assignedProfileIds.has(p.id))
          .sort((a, b) => a.full_name.localeCompare(b.full_name))
          .map((p) => ({ id: p.id, name: p.full_name }));

  const rosterMemberIds = new Set(memberIds);
  const assignableMembers =
    archived || membersFailed || allMembersRes.error
      ? null
      : (allMembersRes.data ?? [])
          .filter((m) => m.status === "active" && !rosterMemberIds.has(m.id))
          .sort((a, b) => a.full_name.localeCompare(b.full_name))
          .map((m) => ({ id: m.id, name: m.full_name }));

  return {
    tab: "people",
    archived,
    leaders,
    members,
    assignableLeaders,
    assignableMembers,
    // Fail closed: a failed funnel read shows a degraded note, never a false
    // "no prospects matched to this group".
    prospectSignals: prospectsRes.error ? null : prospectsRes.data,
  };
}

async function buildHealthTab(
  reads: GroupDetailReads,
  group: GroupsRow,
  periodMonth: string
): Promise<GroupHealthTabData> {
  const [overviewRes, ratingsRes, defaultsRes, platformConfigRes] =
    await Promise.all([
      // Single-group health read (#308) — same grade logic, O(1) reads.
      reads.fetchGroupHealthOverview(group.id, periodMonth),
      reads.fetchGroupHealthRatings(group.id, periodMonth),
      reads.fetchMetricDefaults(),
      // The operator-editable rating question wordings for the shared editor.
      // Super-Admin-only via RLS: a ministry admin reads null and resolveCopy
      // falls back to the documented placeholders — intended, not an error.
      reads.fetchPlatformConfig(),
    ]);

  const failed = Boolean(
    overviewRes.error || ratingsRes.error || defaultsRes.error
  );
  const row = overviewRes.data ?? null;
  const watchGrade = decodeMetricDefaults(
    defaultsRes.data ?? null
  ).group_health_watch_grade;
  const grade = row?.computed_letter ?? null;

  const editableCopy = decodeAppConfig(platformConfigRes.data).editableCopy;

  return {
    tab: "health",
    // Fail closed: a failed health/ratings read must not masquerade as a
    // genuine "Not assessed" / "Not rated" grade.
    failed,
    period: periodMonth,
    health: healthCategory(grade, watchGrade),
    grade,
    stale: row?.stale ?? false,
    attendancePct: row?.attendance_pct ?? null,
    attendanceWeeksCounted: row?.attendance_weeks_counted ?? 0,
    spiritualGrowthScore: ratingsRes.data?.spiritual_growth_score ?? null,
    groupQuestionScore: ratingsRes.data?.group_question_score ?? null,
    // No editor over unknown values: the row only flows through when every
    // status-feeding read succeeded.
    editorRow: failed ? null : row,
    spiritualGrowthLabel: resolveCopy(
      editableCopy,
      GROUP_HEALTH_COPY_KEYS.spiritualGrowth
    ),
    groupQuestionLabel: resolveCopy(
      editableCopy,
      GROUP_HEALTH_COPY_KEYS.groupQuestion
    ),
  };
}

async function buildAttendanceTab(
  reads: GroupDetailReads,
  group: GroupsRow
): Promise<GroupAttendanceTabData> {
  // The check-in flow is frozen (ADR 0002/0009): attendance_sessions receive
  // no new data unless a Super Admin re-enables check-ins via the runtime
  // flag. We surface what's on record as explicitly historical and never
  // frame it as a live feed.
  const [sessionsRes, checkInsLive] = await Promise.all([
    reads.fetchAttendanceSessions({ groupId: group.id, limit: 12 }),
    reads.fetchCheckInsLive(),
  ]);
  return {
    tab: "attendance",
    checkInsLive,
    sessions: sessionsRes.error ? null : (sessionsRes.data ?? []),
  };
}

async function buildFollowUpsTab(
  reads: GroupDetailReads,
  group: GroupsRow
): Promise<GroupFollowUpsTabData> {
  const followUpsRes = await reads.fetchOpenFollowUps({ groupId: group.id });
  return {
    tab: "follow-ups",
    followUps: followUpsRes.error ? null : (followUpsRes.data ?? []),
  };
}

async function buildEventsTab(
  reads: GroupDetailReads,
  group: GroupsRow,
  todayIso: string
): Promise<GroupEventsTabData> {
  const toIso = addDaysIso(todayIso, EVENTS_LOOKAHEAD_DAYS);

  // Pull the saved override rows over the same window so generated
  // occurrences pick up any per-date changes (cancelled, retyped, retitled) —
  // the calendar page merges the two the identical way (read-only here; no
  // writes per ADR 0009).
  const eventsRes = await reads.fetchGroupCalendarEvents({
    groupId: group.id,
    fromDate: todayIso,
    toDate: toIso,
  });

  // Fail closed if the override read failed: without it we cannot tell which
  // generated occurrences were cancelled / retyped / retitled, so showing the
  // un-overridden schedule would present stale dates as live meetings.
  if (eventsRes.error) return { tab: "events", occurrences: null };

  // Reuse the calendar's occurrence-generation + override-merge helpers
  // rather than duplicating the cadence logic. Generated meetings from the
  // group's recurring schedule are surfaced even when no override row exists.
  const generated = generateOccurrencesInRange(
    {
      meetingDay: group.meeting_day,
      meetingTime: group.meeting_time,
      meetingFrequency: group.meeting_frequency,
      meetingWeekParity: group.meeting_week_parity,
    },
    todayIso,
    toIso
  );
  const occurrences = mergeOverrides(
    generated,
    toSavedOverrides(eventsRes.data ?? []),
    group.meeting_time
  );
  return { tab: "events", occurrences };
}

// Pure assembly: the spine first (subject resolution decides 404 — and, as
// before the seam, a failed spine read throws to the route error boundary),
// then ONLY the requested tab's reads. Every fail-closed path is reachable
// from a test through an in-memory `reads` adapter.
export async function buildGroupDetailData(
  reads: GroupDetailReads,
  options: GroupDetailOptions
): Promise<GroupDetailData> {
  const groupResult = await reads.fetchGroupsByIds([options.groupId]);
  if (groupResult.error) throw groupResult.error;
  const group = (groupResult.data ?? [])[0];
  if (!group) return { kind: "not_found" };

  let tabData: GroupDetailTabData;
  switch (options.tab) {
    case "overview":
      tabData = await buildOverviewTab(reads, group, options.periodMonth);
      break;
    case "people":
      tabData = await buildPeopleTab(reads, group);
      break;
    case "health":
      tabData = await buildHealthTab(reads, group, options.periodMonth);
      break;
    case "attendance":
      tabData = await buildAttendanceTab(reads, group);
      break;
    case "follow-ups":
      tabData = await buildFollowUpsTab(reads, group);
      break;
    case "events":
      tabData = await buildEventsTab(reads, group, options.todayIso);
      break;
  }
  return { kind: "ok", group, tabData };
}

// Binds the live client (or reports db_unavailable when the DB is not
// configured) and runs the pure assembly. The calling page stays guard →
// load → render.
export async function loadGroupDetailData(
  options: GroupDetailOptions
): Promise<GroupDetailResult> {
  return measureReadBundle(
    "group_detail",
    async () => {
      const client = await createSupabaseServerClient();
      if (!client) return { kind: "db_unavailable" };
      return buildGroupDetailData(supabaseGroupDetailReads(client), options);
    },
    (result) => ({ result_kind: result.kind })
  );
}
