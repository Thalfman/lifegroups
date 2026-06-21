import { createSupabaseServerClient } from "@/lib/supabase/server";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import { readBatch } from "@/lib/supabase/read-batch";
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
  // Declaration order is the error precedence; every read here feeds the four
  // status labels (see the fail-closed gate below).
  const batch = await readBatch({
    leaders: () => reads.fetchAllGroupLeaders({ activeOnly: true }),
    memberships: () => reads.fetchActiveMemberships({ groupId: group.id }),
    defaults: () => reads.fetchMetricDefaults(),
    // Targeted single-group health read (#308): runs the same grade
    // computation as the bulk overview but only for this group, so opening
    // one detail page no longer recomputes every active group.
    health: () => reads.fetchGroupHealthOverview(group.id, periodMonth),
    // Per-group metric overrides — resolved the SAME way the Groups list and
    // Settings do (defaults → per-group override precedence, ADR 0011) so
    // the detail capacity zone can't disagree with the list card.
    override: () => reads.fetchGroupMetricSettings(group.id),
  });

  // The four labels are only trustworthy if every read that feeds them
  // succeeded. On a failure, fail closed (statuses null → the page notice)
  // rather than rendering a confidently-wrong status.
  const statusFailed = !batch.ok;
  const memberCount = batch.errors.memberships
    ? null
    : (batch.results.memberships.data ?? []).length;
  const stale = batch.results.health.data?.stale ?? false;
  if (statusFailed) {
    return { tab: "overview", statuses: null, stale, memberCount };
  }

  const defaults = decodeMetricDefaults(batch.results.defaults.data ?? null);
  const override = batch.results.override.data ?? null;
  const hasLeader = (batch.results.leaders.data ?? []).some(
    (l) => l.group_id === group.id && l.active
  );
  const grade: GroupHealthLetter | null =
    batch.results.health.data?.computed_letter ?? null;

  const cap = effectiveCapacity(group, override, defaults);
  const status = capacityStatus({
    activeMemberCount: (batch.results.memberships.data ?? []).length,
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

  const batch = await readBatch({
    leaders: () => reads.fetchAllGroupLeaders({ activeOnly: true }),
    profiles: () =>
      reads.fetchProfilesForAdmin({ roles: ["leader", "co_leader"] }),
    memberships: () => reads.fetchActiveMemberships({ groupId: group.id }),
    // The full active-member pool feeds the inline assign control; skip the
    // read for an archived group, whose roster is read-only.
    allMembers: archived
      ? () => Promise.resolve({ data: null, error: null })
      : () => reads.fetchAllMembers(),
    prospects: () => reads.fetchProspectSignalsForGroup(group.id),
  });

  const memberIds = (batch.results.memberships.data ?? []).map(
    (m) => m.member_id
  );
  const rosterMemberIds = new Set(memberIds);

  // A non-archived group already loaded the full active-member pool above (it
  // feeds the inline assign control), and the roster is a subset of that pool —
  // so derive the roster rows from it instead of a second round-trip fetching
  // the same records by id. This drops the People tab's one serial read (the
  // batch above all resolves in parallel; `fetchMembersByIds` was awaited after
  // it). `fetchAllMembers` is range-widened past the PostgREST row cap, so the
  // pool reliably contains every roster member — a member can't sort off the
  // first page and silently vanish from the roster. An archived group skips the
  // pool (its roster is read-only), so it still needs the targeted by-id read.
  // The roster fails closed on whichever read backs it.
  const membersRes = archived
    ? await reads.fetchMembersByIds(memberIds)
    : batch.results.allMembers;

  // Fail closed per section, composing precedence from the batch's error bag: a
  // failed read must not render an empty roster as if authoritative (leader
  // names come from the profiles read). The members section also folds in the
  // archived-only by-id waterfall read, which isn't part of the batch.
  const leadersFailed =
    (batch.errors.leaders ?? batch.errors.profiles) !== null;
  const membersFailed =
    (batch.errors.memberships ?? membersRes.error?.message ?? null) !== null;

  const profilesById = new Map(
    (batch.results.profiles.data ?? []).map((p) => [p.id, p])
  );
  const leaders = leadersFailed
    ? null
    : (batch.results.leaders.data ?? [])
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
        .filter((m) => rosterMemberIds.has(m.id) && m.status === "active")
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .map((m) => ({ id: m.id, fullName: m.full_name }));

  // Assignable options for the inline controls. Fail closed: without a
  // trustworthy roster (or pool) the difference can't be computed, so the
  // assign control is suppressed rather than offering wrong choices. An
  // archived group skips options entirely (read-only roster).
  const assignedProfileIds = new Set(
    (batch.results.leaders.data ?? [])
      .filter((l) => l.group_id === group.id && l.active)
      .map((l) => l.profile_id)
  );
  const assignableLeaders =
    archived || leadersFailed
      ? null
      : (batch.results.profiles.data ?? [])
          .filter((p) => p.status === "active" && !assignedProfileIds.has(p.id))
          .sort((a, b) => a.full_name.localeCompare(b.full_name))
          .map((p) => ({ id: p.id, name: p.full_name }));

  const assignableMembers =
    archived || membersFailed || batch.errors.allMembers !== null
      ? null
      : (batch.results.allMembers.data ?? [])
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
    prospectSignals: batch.errors.prospects
      ? null
      : batch.results.prospects.data,
  };
}

async function buildHealthTab(
  reads: GroupDetailReads,
  group: GroupsRow,
  periodMonth: string
): Promise<GroupHealthTabData> {
  const batch = await readBatch({
    // Single-group health read (#308) — same grade logic, O(1) reads.
    overview: () => reads.fetchGroupHealthOverview(group.id, periodMonth),
    ratings: () => reads.fetchGroupHealthRatings(group.id, periodMonth),
    defaults: () => reads.fetchMetricDefaults(),
    // The operator-editable rating question wordings for the shared editor.
    // Super-Admin-only via RLS: a ministry admin reads null and resolveCopy
    // falls back to the documented placeholders — intended, not an error.
    platformConfig: () => reads.fetchPlatformConfig(),
  });

  // platformConfig is deliberately excluded from the gate: a ministry admin
  // reads null under RLS and falls back to placeholder copy — not a failure.
  const failed =
    (batch.errors.overview ?? batch.errors.ratings ?? batch.errors.defaults) !==
    null;
  const row = batch.results.overview.data ?? null;
  const watchGrade = decodeMetricDefaults(
    batch.results.defaults.data ?? null
  ).group_health_watch_grade;
  const grade = row?.computed_letter ?? null;

  const editableCopy = decodeAppConfig(
    batch.results.platformConfig.data
  ).editableCopy;

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
    spiritualGrowthScore:
      batch.results.ratings.data?.spiritual_growth_score ?? null,
    groupQuestionScore:
      batch.results.ratings.data?.group_question_score ?? null,
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
  // checkInsLive is a plain boolean flag (not a ReadResult, it fails safe to
  // false on its own), so it can't go through readBatch; co-await it alongside
  // the batch to keep the two reads concurrent.
  const [batch, checkInsLive] = await Promise.all([
    readBatch({
      sessions: () =>
        reads.fetchAttendanceSessions({ groupId: group.id, limit: 12 }),
    }),
    reads.fetchCheckInsLive(),
  ]);
  return {
    tab: "attendance",
    checkInsLive,
    sessions: batch.errors.sessions
      ? null
      : (batch.results.sessions.data ?? []),
  };
}

async function buildFollowUpsTab(
  reads: GroupDetailReads,
  group: GroupsRow
): Promise<GroupFollowUpsTabData> {
  const batch = await readBatch({
    followUps: () => reads.fetchOpenFollowUps({ groupId: group.id }),
  });
  return {
    tab: "follow-ups",
    followUps: batch.errors.followUps
      ? null
      : (batch.results.followUps.data ?? []),
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
  const batch = await readBatch({
    events: () =>
      reads.fetchGroupCalendarEvents({
        groupId: group.id,
        fromDate: todayIso,
        toDate: toIso,
      }),
  });

  // Fail closed if the override read failed: without it we cannot tell which
  // generated occurrences were cancelled / retyped / retitled, so showing the
  // un-overridden schedule would present stale dates as live meetings.
  if (batch.errors.events) return { tab: "events", occurrences: null };

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
    toSavedOverrides(batch.results.events.data ?? []),
    group.meeting_time
  );
  return { tab: "events", occurrences };
}

// Pure spine read: subject resolution decides 404. As before the seam, a failed
// spine read throws to the route error boundary.
export async function resolveGroupSpine(
  reads: GroupDetailReads,
  groupId: string
): Promise<GroupsRow | null> {
  const groupResult = await reads.fetchGroupsByIds([groupId]);
  if (groupResult.error) throw groupResult.error;
  return (groupResult.data ?? [])[0] ?? null;
}

// Pure per-tab assembly: ONLY the requested tab's reads, given an
// already-resolved group. Every fail-closed path is reachable from a test
// through an in-memory `reads` adapter.
export async function buildGroupTabData(
  reads: GroupDetailReads,
  group: GroupsRow,
  options: GroupDetailOptions
): Promise<GroupDetailTabData> {
  switch (options.tab) {
    case "overview":
      return buildOverviewTab(reads, group, options.periodMonth);
    case "people":
      return buildPeopleTab(reads, group);
    case "health":
      return buildHealthTab(reads, group, options.periodMonth);
    case "attendance":
      return buildAttendanceTab(reads, group);
    case "follow-ups":
      return buildFollowUpsTab(reads, group);
    case "events":
      return buildEventsTab(reads, group, options.todayIso);
  }
}

// Pure assembly composing the spine then the requested tab (kept for the
// in-memory reads-seam tests; the live route now loads spine and tab through
// the split loaders below so it can stream the tab behind a Suspense boundary).
export async function buildGroupDetailData(
  reads: GroupDetailReads,
  options: GroupDetailOptions
): Promise<GroupDetailData> {
  const group = await resolveGroupSpine(reads, options.groupId);
  if (!group) return { kind: "not_found" };
  const tabData = await buildGroupTabData(reads, group, options);
  return { kind: "ok", group, tabData };
}

// The page-facing spine result: the group (for the header + 404 decision) plus
// the no-database case the load wrapper reports when Supabase env vars are
// absent. Loaded synchronously so the route can 404 before it streams anything.
export type GroupSpineResult =
  | { kind: "ok"; group: GroupsRow }
  | { kind: "not_found" }
  | { kind: "db_unavailable" };

// Binds the live client and resolves only the spine (one fast group read). The
// page awaits this before rendering, so notFound() / db-unavailable behavior is
// unchanged; the heavy per-tab reads stream in afterwards via loadGroupTabData.
export async function loadGroupSpine(
  groupId: string
): Promise<GroupSpineResult> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "db_unavailable" };
  const group = await resolveGroupSpine(
    supabaseGroupDetailReads(client),
    groupId
  );
  if (!group) return { kind: "not_found" };
  return { kind: "ok", group };
}

// Binds the live client and runs ONLY the requested tab's reads against the
// already-resolved group. Called inside the route's Suspense boundary so the
// heaviest reads stream in after the spine + tab bar have painted. The group is
// passed in (resolved by loadGroupSpine) so this never re-reads the spine.
export async function loadGroupTabData(
  group: GroupsRow,
  options: GroupDetailOptions
): Promise<GroupDetailTabData> {
  return measureReadBundle(
    "group_detail",
    async () => {
      const client = await createSupabaseServerClient();
      // The spine already proved the client binds for this request; if it
      // somehow does not, surface it to the route error boundary rather than
      // silently degrading every tab read.
      if (!client) throw new Error("group_detail: Supabase client unavailable");
      return buildGroupTabData(
        supabaseGroupDetailReads(client),
        group,
        options
      );
    },
    (tabData) => ({ result_kind: "ok", tab: tabData.tab })
  );
}
