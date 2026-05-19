// Phase 5B.1 page-level read models for the admin weekly check-in
// review. Every helper here composes existing single-table readers from
// lib/supabase/read-models.ts; no new RPC, no new RLS policy, no
// service-role escape hatch. RLS already permits super_admin /
// ministry_admin SELECT on every table referenced below via the Phase 4
// auth_is_admin_or_staff() policies.
//
// The "missing" rule mirrors the one already used by the admin
// dashboard (lib/dashboard/queries.ts:157-160): a group is missing for
// the week when its lifecycle_status is "active" AND either it has no
// attendance_sessions row or the row's status is "not_submitted".
// Keeping the rule in one place avoids the dashboard's count and this
// page's count silently disagreeing.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchActiveMemberships,
  fetchAllGroupLeaders,
  fetchAllGroupMetricSettings,
  fetchAllGroups,
  fetchAttendanceRecordsForSessions,
  fetchAttendanceSessions,
  fetchGroupCalendarEvents,
  fetchGroupsByIds,
  fetchLatestHealthUpdates,
  fetchMembersByIds,
  fetchMetricDefaults,
  fetchProfilesForAdmin,
} from "@/lib/supabase/read-models";
import { CHURCH_TIMEZONE, isoWeekStart } from "@/lib/leader/validation";
import {
  BUILT_IN_METRIC_DEFAULTS,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import {
  computeCheckInDue,
  formatCheckInDueLabel,
  formatCheckInDueRelative,
  pickCalendarOverrideForWeek,
  type CalendarEventLite,
} from "@/lib/admin/check-in-due";
import type {
  AttendanceRecordsRow,
  AttendanceSessionsRow,
  GroupCalendarEventsRow,
  GroupHealthUpdatesRow,
  GroupLeadersRow,
  GroupMetricSettingsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";
import type {
  AttendanceStatus,
  GroupHealthStatus,
  GroupLifecycleStatus,
} from "@/types/enums";

type ReadClient = AppSupabaseClient;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEADER_NOTE_PREVIEW_MAX = 140;
const WEEK_OPTIONS_DEFAULT_COUNT = 8;

export type SessionReviewStatus =
  | "submitted"
  | "admin_entered"
  | "did_not_meet"
  | "planned_pause"
  | "missing";

export type LeaderPulseDisplay = "healthy" | "watch" | "needs_follow_up";

export type AttendanceCounts = {
  present: number;
  absent: number;
  excused: number;
};

export type GroupReviewRow = {
  groupId: string;
  groupName: string;
  meetingDay: string | null;
  meetingTime: string | null;
  lifecycleStatus: GroupLifecycleStatus;
  isActive: boolean;
  leaderNames: string[];
  sessionStatus: SessionReviewStatus;
  submittedByName: string | null;
  submittedAt: string | null;
  meetingDate: string | null;
  attendance: AttendanceCounts | null;
  healthPulse: LeaderPulseDisplay | null;
  followUpNeeded: boolean;
  leaderNotePreview: string | null;
  // Phase 5A.5 shared due-date logic.
  dueLabel: string | null;
  dueRelative: string | null;
  isOverdue: boolean;
  // False for bi-weekly groups in their off-parity week; suppresses the
  // "Missing" badge so the review surface doesn't accuse a group of
  // missing a check-in for a week it wasn't scheduled to meet.
  isScheduledThisWeek: boolean;
};

export type WeeklyReviewSummary = {
  totalActive: number;
  submitted: number;
  missing: number;
  didNotMeet: number;
  plannedPause: number;
  needsFollowUp: number;
};

export type WeeklyReviewErrors = {
  groups: string | null;
  leaders: string | null;
  profiles: string | null;
  sessions: string | null;
  records: string | null;
  health: string | null;
  settings: string | null;
};

export type WeeklyReviewData = {
  meetingWeek: string;
  rows: GroupReviewRow[];
  summary: WeeklyReviewSummary;
  errors: WeeklyReviewErrors;
};

export type WeekOption = {
  value: string;
  label: string;
  isCurrent: boolean;
};

export type CheckInDetailMember = {
  memberId: string;
  fullName: string;
  attendanceStatus: AttendanceStatus | null;
};

export type CheckInDetailErrors = {
  group: string | null;
  leaders: string | null;
  profiles: string | null;
  session: string | null;
  records: string | null;
  health: string | null;
  memberships: string | null;
  members: string | null;
};

export type CheckInDetailData = {
  groupId: string;
  meetingWeek: string;
  group: GroupsRow | null;
  leaderNames: string[];
  session: AttendanceSessionsRow | null;
  sessionStatus: SessionReviewStatus;
  submittedByName: string | null;
  attendance: AttendanceCounts | null;
  health: GroupHealthUpdatesRow | null;
  members: CheckInDetailMember[];
  errors: CheckInDetailErrors;
};

const EMPTY_SUMMARY: WeeklyReviewSummary = {
  totalActive: 0,
  submitted: 0,
  missing: 0,
  didNotMeet: 0,
  plannedPause: 0,
  needsFollowUp: 0,
};

const EMPTY_WEEKLY_ERRORS: WeeklyReviewErrors = {
  groups: null,
  leaders: null,
  profiles: null,
  sessions: null,
  records: null,
  health: null,
  settings: null,
};

const EMPTY_DETAIL_ERRORS: CheckInDetailErrors = {
  group: null,
  leaders: null,
  profiles: null,
  session: null,
  records: null,
  health: null,
  memberships: null,
  members: null,
};

// Accept the Next.js searchParams shape (string | string[] | undefined)
// and return a normalized Monday-ISO-date. Invalid input falls back to
// the current week so a tampered URL never crashes the page.
export function validateWeekParam(
  raw: string | string[] | undefined,
  now: Date = new Date(),
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "string" || !ISO_DATE_RE.test(value)) {
    return isoWeekStart(now);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return isoWeekStart(now);
  }
  // Reject values that aren't already Mondays so the URL stays
  // canonical. isoWeekStart(value) returns the Monday for any input;
  // we require the input to equal that Monday.
  const normalized = isoWeekStart(value);
  return normalized === value ? value : isoWeekStart(now);
}

const WEEK_LABEL_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function buildWeekOptions(
  now: Date = new Date(),
  count: number = WEEK_OPTIONS_DEFAULT_COUNT,
): WeekOption[] {
  const currentMonday = isoWeekStart(now);
  const anchor = new Date(`${currentMonday}T00:00:00Z`);
  const options: WeekOption[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    const value = d.toISOString().slice(0, 10);
    const isCurrent = value === currentMonday;
    const formatted = WEEK_LABEL_FMT.format(d);
    options.push({
      value,
      label: isCurrent ? `Week of ${formatted} (this week)` : `Week of ${formatted}`,
      isCurrent,
    });
  }
  return options;
}

export function truncatePreview(
  note: string | null,
  max: number = LEADER_NOTE_PREVIEW_MAX,
): string | null {
  if (!note) return null;
  const trimmed = note.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

const SUBMITTED_AT_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: CHURCH_TIMEZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatSubmittedAt(ts: string | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return SUBMITTED_AT_FMT.format(d);
}

const MEETING_DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatMeetingDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return MEETING_DATE_FMT.format(d);
}

const WEEK_LABEL_FULL_FMT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatWeekLabel(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return `Week of ${WEEK_LABEL_FULL_FMT.format(d)}`;
}

export function lifecycleStatusLabel(status: GroupLifecycleStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "planned_pause":
      return "Planned pause";
    case "seasonal_break":
      return "Seasonal break";
    case "launching_soon":
      return "Launching soon";
    case "needs_leader":
      return "Needs leader";
    case "at_risk":
      return "At risk";
    case "closed":
      return "Closed";
    default:
      return status;
  }
}

function isLeaderPulse(value: GroupHealthStatus | null | undefined): value is LeaderPulseDisplay {
  return value === "healthy" || value === "watch" || value === "needs_follow_up";
}

function addDaysIsoForWeek(iso: string, days: number): string {
  const anchor = new Date(`${iso}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

function buildCalendarEventsByGroupCheckIns(
  events: GroupCalendarEventsRow[],
): Map<string, CalendarEventLite[]> {
  const m = new Map<string, CalendarEventLite[]>();
  for (const e of events) {
    const list = m.get(e.group_id) ?? [];
    list.push({
      event_date: e.event_date,
      start_time: e.start_time,
      status: e.status,
      archived_at: e.archived_at,
    });
    m.set(e.group_id, list);
  }
  return m;
}

function deriveSessionStatus(
  session: AttendanceSessionsRow | null,
): SessionReviewStatus {
  if (!session) return "missing";
  switch (session.status) {
    case "submitted":
      return "submitted";
    case "admin_entered":
      return "admin_entered";
    case "did_not_meet":
      return "did_not_meet";
    case "planned_pause":
      return "planned_pause";
    case "not_submitted":
    default:
      return "missing";
  }
}

function countAttendance(records: AttendanceRecordsRow[]): AttendanceCounts {
  const counts: AttendanceCounts = { present: 0, absent: 0, excused: 0 };
  for (const r of records) {
    if (r.attendance_status === "present") counts.present++;
    else if (r.attendance_status === "absent") counts.absent++;
    else if (r.attendance_status === "excused") counts.excused++;
  }
  return counts;
}

function profileNameMap(profiles: ProfilesRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of profiles) m.set(p.id, p.full_name);
  return m;
}

function leaderNamesByGroup(
  leaders: GroupLeadersRow[],
  names: Map<string, string>,
): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const row of leaders) {
    const name = names.get(row.profile_id);
    if (!name) continue;
    const list = m.get(row.group_id) ?? [];
    list.push(name);
    m.set(row.group_id, list);
  }
  for (const list of m.values()) list.sort((a, b) => a.localeCompare(b));
  return m;
}

// Sort order for the review list:
//   1. Missing (the urgent rows)
//   2. Active with follow-up needed
//   3. Everything else by group name
function compareReviewRows(a: GroupReviewRow, b: GroupReviewRow): number {
  // Only sort a row to the top as "missing" if it was actually scheduled
  // to meet this week. Off-parity bi-weekly groups stay in the body of
  // the list.
  const aMissing =
    a.sessionStatus === "missing" && a.isActive && a.isScheduledThisWeek ? 0 : 1;
  const bMissing =
    b.sessionStatus === "missing" && b.isActive && b.isScheduledThisWeek ? 0 : 1;
  if (aMissing !== bMissing) return aMissing - bMissing;
  const aFollowUp = a.followUpNeeded ? 0 : 1;
  const bFollowUp = b.followUpNeeded ? 0 : 1;
  if (aFollowUp !== bFollowUp) return aFollowUp - bFollowUp;
  return a.groupName.localeCompare(b.groupName);
}

export async function fetchAdminWeeklyCheckInReview(
  client: ReadClient,
  meetingWeek: string,
  now: Date = new Date(),
): Promise<WeeklyReviewData> {
  const weekEnd = addDaysIsoForWeek(meetingWeek, 6);

  const [
    groupsResult,
    leadersResult,
    profilesResult,
    sessionsResult,
    healthResult,
    metricDefaultsResult,
    metricSettingsResult,
    calendarEventsResult,
  ] = await Promise.all([
    fetchAllGroups(client),
    fetchAllGroupLeaders(client, { activeOnly: true }),
    // We fetch every profile so we can resolve the submitter id for any
    // session (leaders for normal submissions, ministry/super admins for
    // future admin_entered sessions). Profile counts in this app are
    // small, so this is comparable in cost to one targeted IN-filter
    // and saves a second round-trip.
    fetchProfilesForAdmin(client),
    fetchAttendanceSessions(client, { meetingWeek }),
    fetchLatestHealthUpdates(client, { updateWeek: meetingWeek }),
    fetchMetricDefaults(client),
    fetchAllGroupMetricSettings(client),
    fetchGroupCalendarEvents(client, {
      fromDate: meetingWeek,
      toDate: weekEnd,
      includeArchived: false,
    }),
  ]);

  const errors: WeeklyReviewErrors = { ...EMPTY_WEEKLY_ERRORS };
  errors.groups = groupsResult.error?.message ?? null;
  errors.leaders = leadersResult.error?.message ?? null;
  errors.profiles = profilesResult.error?.message ?? null;
  errors.sessions = sessionsResult.error?.message ?? null;
  errors.health = healthResult.error?.message ?? null;
  errors.settings =
    metricDefaultsResult.error?.message ??
    metricSettingsResult.error?.message ??
    calendarEventsResult.error?.message ??
    null;

  const groups = (groupsResult.data ?? []).filter(
    (g) => g.lifecycle_status !== "closed",
  );
  const leaders = leadersResult.data ?? [];
  const profiles = profilesResult.data ?? [];
  const sessions = sessionsResult.data ?? [];
  const healthUpdates = healthResult.data ?? [];
  const metricSettings = metricSettingsResult.data ?? [];
  const calendarEventsByGroup = buildCalendarEventsByGroupCheckIns(
    calendarEventsResult.data ?? [],
  );

  const sessionIds = sessions.map((s) => s.id);
  const recordsResult = await fetchAttendanceRecordsForSessions(client, sessionIds);
  errors.records = recordsResult.error?.message ?? null;
  const records = recordsResult.data ?? [];

  const profileNames = profileNameMap(profiles);
  const leaderNames = leaderNamesByGroup(leaders, profileNames);

  const sessionByGroup = new Map<string, AttendanceSessionsRow>();
  for (const s of sessions) sessionByGroup.set(s.group_id, s);

  const healthByGroup = new Map<string, GroupHealthUpdatesRow>();
  for (const h of healthUpdates) healthByGroup.set(h.group_id, h);

  const recordsBySession = new Map<string, AttendanceRecordsRow[]>();
  for (const r of records) {
    const list = recordsBySession.get(r.session_id) ?? [];
    list.push(r);
    recordsBySession.set(r.session_id, list);
  }

  const metricSettingsByGroup = new Map<string, GroupMetricSettingsRow>(
    metricSettings.map((s) => [s.group_id, s]),
  );
  const defaults = metricDefaultsResult.error
    ? BUILT_IN_METRIC_DEFAULTS
    : decodeMetricDefaults(metricDefaultsResult.data ?? null);

  const rows: GroupReviewRow[] = groups.map((g) => {
    const session = sessionByGroup.get(g.id) ?? null;
    const sessionStatus = deriveSessionStatus(session);
    const sessionRecords = session ? recordsBySession.get(session.id) ?? [] : [];
    const showCounts =
      sessionStatus === "submitted" || sessionStatus === "admin_entered";
    const attendance = showCounts ? countAttendance(sessionRecords) : null;
    const health = healthByGroup.get(g.id) ?? null;
    const submitterName =
      session && session.submitted_by ? profileNames.get(session.submitted_by) ?? null : null;
    const calendarOverride = pickCalendarOverrideForWeek(
      calendarEventsByGroup.get(g.id) ?? [],
      meetingWeek,
    );
    const dueResult = computeCheckInDue({
      group: {
        meetingDay: g.meeting_day,
        meetingTime: g.meeting_time,
        meetingFrequency: g.meeting_frequency,
        meetingWeekParity: g.meeting_week_parity,
      },
      override: metricSettingsByGroup.get(g.id) ?? null,
      defaults,
      meetingWeek,
      now,
      calendarOverride,
    });
    // Any non-"missing" session counts as the leader having checked in for
    // the week. submitted / admin_entered are the obvious cases; did_not_meet
    // and planned_pause are also valid leader submissions that settle the
    // week, so they should suppress overdue messaging too (otherwise a row
    // ends up "Did not meet · Overdue" simultaneously).
    const isCheckedInThisWeek = sessionStatus !== "missing";
    return {
      groupId: g.id,
      groupName: g.name,
      meetingDay: g.meeting_day,
      meetingTime: g.meeting_time,
      lifecycleStatus: g.lifecycle_status,
      isActive: g.lifecycle_status === "active",
      leaderNames: leaderNames.get(g.id) ?? [],
      sessionStatus,
      submittedByName: submitterName,
      submittedAt: session?.submitted_at ?? null,
      meetingDate: session?.meeting_date ?? null,
      attendance,
      healthPulse: isLeaderPulse(health?.pulse) ? health!.pulse : null,
      followUpNeeded: health?.follow_up_needed ?? false,
      leaderNotePreview: truncatePreview(session?.leader_note ?? null),
      dueLabel: formatCheckInDueLabel(dueResult.due),
      dueRelative: formatCheckInDueRelative(dueResult),
      // Only treat the row as "overdue" if (1) due-date math worked AND
      // (2) the leader hasn't already submitted *anything* for this week
      // (submitted / admin_entered / did_not_meet / planned_pause all
      // count as "in").
      isOverdue: dueResult.isOverdue && !isCheckedInThisWeek,
      isScheduledThisWeek: dueResult.isScheduledThisWeek,
    };
  });

  rows.sort(compareReviewRows);

  const summary: WeeklyReviewSummary = { ...EMPTY_SUMMARY };
  for (const row of rows) {
    if (!row.isActive) continue;
    summary.totalActive++;
    if (row.followUpNeeded) summary.needsFollowUp++;
    switch (row.sessionStatus) {
      case "submitted":
      case "admin_entered":
        summary.submitted++;
        break;
      case "did_not_meet":
        summary.didNotMeet++;
        break;
      case "planned_pause":
        summary.plannedPause++;
        break;
      case "missing":
        // Only count a missing session toward the "Missing" tile when
        // the group was actually scheduled to meet this week. Bi-weekly
        // off-parity groups otherwise inflate the missing count for a
        // week they were never expected to check in.
        if (row.isScheduledThisWeek) summary.missing++;
        break;
    }
  }

  return {
    meetingWeek,
    rows,
    summary,
    errors,
  };
}

export async function fetchAdminCheckInDetail(
  client: ReadClient,
  groupId: string,
  meetingWeek: string,
): Promise<CheckInDetailData> {
  const [
    groupResult,
    leadersResult,
    profilesResult,
    sessionsResult,
    healthResult,
    membershipsResult,
  ] = await Promise.all([
    fetchGroupsByIds(client, [groupId]),
    fetchAllGroupLeaders(client, { activeOnly: true }),
    fetchProfilesForAdmin(client),
    fetchAttendanceSessions(client, { groupId, meetingWeek }),
    fetchLatestHealthUpdates(client, { groupId, updateWeek: meetingWeek }),
    fetchActiveMemberships(client, { groupId }),
  ]);

  const errors: CheckInDetailErrors = { ...EMPTY_DETAIL_ERRORS };
  errors.group = groupResult.error?.message ?? null;
  errors.leaders = leadersResult.error?.message ?? null;
  errors.profiles = profilesResult.error?.message ?? null;
  errors.session = sessionsResult.error?.message ?? null;
  errors.health = healthResult.error?.message ?? null;
  errors.memberships = membershipsResult.error?.message ?? null;

  const group = (groupResult.data ?? [])[0] ?? null;
  const leaders = (leadersResult.data ?? []).filter((l) => l.group_id === groupId);
  const profiles = profilesResult.data ?? [];
  const session = (sessionsResult.data ?? [])[0] ?? null;
  const health = (healthResult.data ?? [])[0] ?? null;
  const memberships = membershipsResult.data ?? [];

  const profileNames = profileNameMap(profiles);
  const leaderNames = leaders
    .map((l) => profileNames.get(l.profile_id))
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b));

  const submittedByName =
    session && session.submitted_by ? profileNames.get(session.submitted_by) ?? null : null;

  // Pull active members for the roster. The roster always renders, so
  // the admin sees who would be marked when a leader submits.
  const memberIds = memberships.map((m) => m.member_id);
  const membersResult = await fetchMembersByIds(client, memberIds);
  errors.members = membersResult.error?.message ?? null;
  const memberRows = (membersResult.data ?? [])
    .filter((m: MembersRow) => m.status === "active")
    .sort((a: MembersRow, b: MembersRow) => a.full_name.localeCompare(b.full_name));

  // Pull attendance records if a session exists.
  let records: AttendanceRecordsRow[] = [];
  if (session) {
    const recordsResult = await fetchAttendanceRecordsForSessions(client, [session.id]);
    errors.records = recordsResult.error?.message ?? null;
    records = recordsResult.data ?? [];
  }

  const recordByMember = new Map<string, AttendanceStatus>();
  for (const r of records) recordByMember.set(r.member_id, r.attendance_status);

  const sessionStatus = deriveSessionStatus(session);
  const showCounts =
    sessionStatus === "submitted" || sessionStatus === "admin_entered";
  const attendance = showCounts ? countAttendance(records) : null;

  const members: CheckInDetailMember[] = memberRows.map((m) => ({
    memberId: m.id,
    fullName: m.full_name,
    attendanceStatus: recordByMember.get(m.id) ?? null,
  }));

  return {
    groupId,
    meetingWeek,
    group,
    leaderNames,
    session,
    sessionStatus,
    submittedByName,
    attendance,
    health,
    members,
    errors,
  };
}
