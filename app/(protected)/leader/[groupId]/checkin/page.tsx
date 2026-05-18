import { notFound, redirect } from "next/navigation";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { CheckInForm } from "@/components/leader/check-in-form";
import { requireLeader } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchActiveMemberships,
  fetchAttendanceRecordsForSessions,
  fetchAttendanceSessions,
  fetchGroupsByIds,
  fetchLatestHealthUpdates,
  fetchMembersByIds,
} from "@/lib/supabase/read-models";
import { isoWeekStart } from "@/lib/leader/validation";
import type {
  AttendanceSessionsRow,
  GroupHealthUpdatesRow,
  GroupsRow,
  MembersRow,
} from "@/types/database";

export const dynamic = "force-dynamic";

type Params = { groupId: string };

type CheckInPrefill = {
  status: "submitted" | "did_not_meet" | "planned_pause";
  meetingDate: string | null;
  leaderNote: string;
  pulse: "healthy" | "watch" | "needs_follow_up" | "";
  followUpNeeded: boolean;
  attendance: Record<string, "present" | "absent" | "excused">;
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
  if (!session.assignedGroupIds.includes(groupId)) {
    redirect("/leader");
  }

  const client = await createSupabaseServerClient();
  if (!client) notFound();

  const meetingWeek = isoWeekStart(new Date());

  const [groupResult, membershipsResult, sessionResult, healthResult] = await Promise.all([
    fetchGroupsByIds(client, [groupId]),
    fetchActiveMemberships(client, { groupId }),
    fetchAttendanceSessions(client, { groupId, meetingWeek }),
    fetchLatestHealthUpdates(client, { groupId }),
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

  const memberships = membershipsResult.data ?? [];
  const memberIds = memberships.map((m) => m.member_id);
  const membersResult = await fetchMembersByIds(client, memberIds);
  if (membersResult.error) throw membersResult.error;
  const members = ((membersResult.data ?? []) as MembersRow[])
    .filter((m) => m.status === "active")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const existingSession = ((sessionResult.data ?? []) as AttendanceSessionsRow[])[0] ?? null;
  let attendanceMap: Record<string, "present" | "absent" | "excused"> = {};
  if (existingSession) {
    const recordsResult = await fetchAttendanceRecordsForSessions(client, [existingSession.id]);
    if (recordsResult.error) throw recordsResult.error;
    for (const rec of recordsResult.data ?? []) {
      attendanceMap[rec.member_id] = rec.attendance_status;
    }
  }

  const existingHealth =
    ((healthResult.data ?? []) as GroupHealthUpdatesRow[]).find(
      (h) => h.update_week === meetingWeek,
    ) ?? null;

  const prefill: CheckInPrefill = existingSession
    ? {
        status:
          existingSession.status === "submitted"
            || existingSession.status === "did_not_meet"
            || existingSession.status === "planned_pause"
            ? existingSession.status
            : "submitted",
        meetingDate: existingSession.meeting_date,
        leaderNote: existingSession.leader_note ?? "",
        pulse:
          existingHealth?.pulse === "healthy"
            || existingHealth?.pulse === "watch"
            || existingHealth?.pulse === "needs_follow_up"
            ? existingHealth.pulse
            : "",
        followUpNeeded: existingHealth?.follow_up_needed ?? false,
        attendance: attendanceMap,
      }
    : EMPTY_PREFILL;

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow="Leader · Weekly check-in"
      title={group.name}
      titleItalic={existingSession ? "— update" : "— this week"}
      lede={
        existingSession
          ? "You already saved a check-in for this week. Make any changes and submit again — we'll keep the record current."
          : "Mark who came, jot a quick note, and submit. The whole thing takes a minute."
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
        members={members.map((m) => ({ id: m.id, fullName: m.full_name }))}
        alreadySubmitted={Boolean(existingSession)}
        prefill={prefill}
      />
    </PastoralAppShell>
  );
}
