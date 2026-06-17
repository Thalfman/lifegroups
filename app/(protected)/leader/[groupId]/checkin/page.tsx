import { notFound, redirect } from "next/navigation";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { CheckInForm } from "@/components/leader/check-in-form";
import { FrozenSurfaceNotice } from "@/components/admin/frozen-surface-notice";
import { requireLeader } from "@/lib/auth/session";
import { toShellUser } from "@/lib/auth/shell-user";
import { readFrozenSurfaceFlagForLeader } from "@/lib/auth/leader-surface-flag";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchActiveMemberships,
  fetchAttendanceRecordsForSessions,
  fetchAttendanceSessions,
  fetchGroupCalendarEvents,
  fetchGroupsByIds,
  fetchLatestHealthUpdates,
  fetchMembersByIds,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import { isoWeekStart } from "@/lib/shared/church-time";
import {
  BUILT_IN_METRIC_DEFAULTS,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import {
  computeCheckInDue,
  expectedMeetingDateForWeek,
  formatCheckInDueLabel,
  formatCheckInDueRelative,
  pickCalendarOverrideForOccurrence,
} from "@/lib/admin/check-in-due";
import type {
  AttendanceSessionsRow,
  GroupHealthUpdatesRow,
  GroupsRow,
  MembersRow,
} from "@/types/database";

export const dynamic = "force-dynamic";

type Params = { groupId: string };

type AttendanceStatus = "present" | "absent" | "excused";

type CheckInPrefill = {
  status: "submitted" | "did_not_meet" | "planned_pause";
  meetingDate: string | null;
  leaderNote: string;
  pulse: "healthy" | "watch" | "needs_follow_up" | "";
  followUpNeeded: boolean;
  attendance: Record<string, AttendanceStatus>;
};

const EMPTY_PREFILL: CheckInPrefill = {
  status: "submitted",
  meetingDate: null,
  leaderNote: "",
  pulse: "",
  followUpNeeded: false,
  attendance: {},
};

export default async function CheckInPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { groupId } = await params;
  const session = await requireLeader();

  // Check-ins stay FROZEN, DECOUPLED from leader_surface (#376 criterion 2).
  // The /leader/** tree (and this page's requireLeader guard) is gated on
  // `leader_surface`, but the check-in surface — this route plus the
  // leader_submit_group_checkin RPC it writes through — carries its OWN
  // independent `check_ins` frozen gate (ADR 0002 / 0009). So even when
  // leader_surface is enabled-and-verified, check-ins do NOT re-open until
  // `check_ins` is itself enabled-and-verified (it stays off this slice). We
  // read it through the same leader-safe RPC and show the explicit frozen
  // notice when it is not live, before any check-in data is loaded.
  const checkInsLive = await readFrozenSurfaceFlagForLeader("check_ins");
  if (!checkInsLive) {
    return <FrozenSurfaceNotice surfaceLabel="Weekly check-ins" />;
  }

  if (!session.assignedGroupIds.includes(groupId)) {
    redirect("/leader");
  }

  const client = await createSupabaseServerClient();
  if (!client) notFound();

  const meetingWeek = isoWeekStart(new Date());
  const weekEnd = (() => {
    const anchor = new Date(`${meetingWeek}T00:00:00Z`);
    anchor.setUTCDate(anchor.getUTCDate() + 6);
    return anchor.toISOString().slice(0, 10);
  })();

  const [
    groupResult,
    membershipsResult,
    sessionResult,
    healthResult,
    metricDefaultsResult,
    calendarEventsResult,
  ] = await Promise.all([
    fetchGroupsByIds(client, [groupId]),
    fetchActiveMemberships(client, { groupId }),
    fetchAttendanceSessions(client, { groupId, meetingWeek }),
    fetchLatestHealthUpdates(client, { groupId }),
    fetchMetricDefaultsCached(client),
    fetchGroupCalendarEvents(client, {
      groupId,
      fromDate: meetingWeek,
      toDate: weekEnd,
      includeArchived: false,
    }),
  ]);

  if (groupResult.error) throw groupResult.error;
  const group = (groupResult.data ?? [])[0] as GroupsRow | undefined;
  if (!group) notFound();

  if (group.lifecycle_status === "closed") {
    redirect("/leader?closed=" + encodeURIComponent(group.id));
  }

  if (membershipsResult.error) throw membershipsResult.error;
  if (sessionResult.error) throw sessionResult.error;
  if (healthResult.error) throw healthResult.error;
  // Fail closed on calendar read errors. Silently dropping back to
  // null would compute due dates from the default cadence and could
  // show "due Tuesday 7pm" for a week that was actually marked OFF or
  // Cancelled -- exactly the wrong UX. Better to surface the error.
  if (calendarEventsResult.error) throw calendarEventsResult.error;

  const memberships = membershipsResult.data ?? [];
  const memberIds = memberships.map((m) => m.member_id);
  const membersResult = await fetchMembersByIds(client, memberIds);
  if (membersResult.error) throw membersResult.error;
  const members = ((membersResult.data ?? []) as MembersRow[])
    .filter((m) => m.status === "active")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const existingSession =
    ((sessionResult.data ?? []) as AttendanceSessionsRow[])[0] ?? null;
  const attendanceMap: Record<string, AttendanceStatus> = {};
  if (existingSession) {
    const recordsResult = await fetchAttendanceRecordsForSessions(client, [
      existingSession.id,
    ]);
    if (recordsResult.error) throw recordsResult.error;
    // Filter prefilled attendance to members still on the active roster.
    // Historical attendance_records are intentionally never deleted, so a
    // member who has since been removed from the group will still have a
    // row pointing at this session. Including their id in the form's
    // hidden attendance JSON would later trigger `invalid_member` from
    // the RPC and block the leader from updating the check-in at all.
    const activeMemberIds = new Set(members.map((m) => m.id));
    for (const rec of recordsResult.data ?? []) {
      if (activeMemberIds.has(rec.member_id)) {
        attendanceMap[rec.member_id] = rec.attendance_status;
      }
    }
  }

  const existingHealth =
    ((healthResult.data ?? []) as GroupHealthUpdatesRow[]).find(
      (h) => h.update_week === meetingWeek
    ) ?? null;

  // Phase 5A.5: due-date is computed from the group's meeting day/time +
  // the global offset default. Per-group offset overrides live on
  // group_metric_settings (admin-only RLS); the leader view always uses
  // the global default. The admin dashboard / check-ins surface use the
  // same helper but pass the override when available.
  const metricDefaults = metricDefaultsResult.error
    ? BUILT_IN_METRIC_DEFAULTS
    : decodeMetricDefaults(metricDefaultsResult.data ?? null);
  // Phase 5A.6 (corrected): if a leader has overridden the cadence's
  // expected meeting occurrence for this week, the gathering type /
  // status replaces the default. OFF / cancelled suppress the due
  // timestamp. Meeting time is always inherited from the group
  // schedule; the override carries no time. Special one-off rows on
  // non-meeting dates are ignored for check-in due math -- they appear
  // on the calendar grid but don't shift the regular weekly check-in.
  const occurrenceDate = expectedMeetingDateForWeek(meetingWeek, {
    meetingDay: group.meeting_day,
    meetingFrequency: group.meeting_frequency,
    meetingWeekParity: group.meeting_week_parity,
  });
  const calendarOverride = pickCalendarOverrideForOccurrence(
    (calendarEventsResult.data ?? []).map((e) => ({
      id: e.id,
      event_date: e.event_date,
      status: e.status,
      archived_at: e.archived_at,
    })),
    occurrenceDate
  );
  const dueResult = computeCheckInDue({
    group: {
      meetingDay: group.meeting_day,
      meetingTime: group.meeting_time,
      meetingFrequency: group.meeting_frequency,
      meetingWeekParity: group.meeting_week_parity,
    },
    // Per-group offset overrides live on group_metric_settings (admin-only
    // RLS), so the leader workflow always uses the global default.
    override: null,
    defaults: metricDefaults,
    // Anchor due-date math to the week the leader is checking in for
    // (the same `meetingWeek` we hand to the form) so a bi-weekly group's
    // parity check is judged against this week, not whatever "now" is.
    meetingWeek,
    calendarOverride,
  });
  const dueLabel = formatCheckInDueLabel(dueResult.due);
  const dueRelative = formatCheckInDueRelative(dueResult);

  const prefill: CheckInPrefill = existingSession
    ? {
        status:
          existingSession.status === "submitted" ||
          existingSession.status === "did_not_meet" ||
          existingSession.status === "planned_pause"
            ? existingSession.status
            : "submitted",
        meetingDate: existingSession.meeting_date,
        leaderNote: existingSession.leader_note ?? "",
        pulse:
          existingHealth?.pulse === "healthy" ||
          existingHealth?.pulse === "watch" ||
          existingHealth?.pulse === "needs_follow_up"
            ? existingHealth.pulse
            : "",
        followUpNeeded: existingHealth?.follow_up_needed ?? false,
        attendance: attendanceMap,
      }
    : EMPTY_PREFILL;

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      currentUser={toShellUser(session.profile)}
      eyebrow="Check-in"
      title={group.name}
      titleItalic={existingSession ? "— update" : "— this week"}
      lede={
        existingSession
          ? "You already saved a check-in for this week. Make any changes and submit again — we'll keep the record current."
          : "Mark who came, jot a quick note, and submit. It only takes a minute."
      }
      contentMaxWidth={720}
      headerSlot={
        <>
          <UserPill
            name={session.profile.full_name}
            email={session.profile.email}
            role={session.profile.role}
          />
          <LogoutButton />
        </>
      }
    >
      <CheckInForm
        groupId={group.id}
        groupName={group.name}
        meetingWeek={meetingWeek}
        meetingDay={group.meeting_day}
        meetingTime={group.meeting_time}
        dueLabel={dueLabel}
        dueRelative={dueRelative}
        isOverdue={dueResult.isOverdue}
        members={members.map((m) => ({ id: m.id, fullName: m.full_name }))}
        alreadySubmitted={Boolean(existingSession)}
        prefill={prefill}
      />
    </PastoralAppShell>
  );
}
