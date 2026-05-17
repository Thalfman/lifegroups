import {
  GUEST_PIPELINE_STAGES,
  fetchActiveGroupCount,
  fetchActiveMemberships,
  fetchAllGroups,
  fetchAttendanceRecordsForSessions,
  fetchAttendanceSessions,
  fetchGroupsByIds,
  fetchGuests,
  fetchLatestHealthUpdates,
  fetchLatestMeetingWeek,
  fetchMembersByIds,
  fetchNewGuestsForGroupSince,
  fetchOpenFollowUps,
} from "@/lib/supabase/read-models";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  AdminDashboardData,
  CapacityRow,
  DashboardResult,
  FollowUpItem,
  LeaderDashboardData,
  LeaderGroupDashboard,
  PipelineStageCount,
} from "./types";
import { ADMIN_FALLBACK, LEADER_FALLBACK } from "./fallback-data";
import { pipelineStageLabel } from "./labels";
import type {
  AttendanceRecordsRow,
  FollowUpsRow,
  GroupHealthUpdatesRow,
  GroupMembershipsRow,
  GroupsRow,
  MembersRow,
} from "@/types/database";
import type { GuestPipelineStage } from "@/types/enums";

const NEAR_CAPACITY_THRESHOLD = 0.8;

function isoWeekStart(date: Date): string {
  // attendance_sessions.meeting_week is stored as the Monday-of-week date
  // (see supabase/seed/phase2_seed.sql), so this helper returns the Monday
  // that contains `date`. JS getUTCDay returns Sun=0..Sat=6; map to a
  // Monday-anchored offset so Mon→0, Tue→1, ..., Sun→6.
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = copy.getUTCDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - mondayOffset);
  return copy.toISOString().slice(0, 10);
}

function describeWeek(meetingWeekIso: string): string {
  const date = new Date(`${meetingWeekIso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function fallback<T>(data: T, error?: string): DashboardResult<T> {
  return { source: "fallback", data, error };
}

function live<T>(data: T): DashboardResult<T> {
  return { source: "live", data };
}

function countPipeline(stages: GuestPipelineStage[], all: { pipeline_stage: GuestPipelineStage }[]): PipelineStageCount[] {
  return stages.map((stage) => ({
    stage,
    label: pipelineStageLabel(stage),
    count: all.filter((g) => g.pipeline_stage === stage).length,
  }));
}

function toFollowUpItem(
  row: FollowUpsRow,
  groupsById: Map<string, GroupsRow>,
): FollowUpItem {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date,
    relatedGroupName: row.related_group_id ? groupsById.get(row.related_group_id)?.name ?? null : null,
  };
}

function shortenName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0)}.`;
}

function computeAttendanceRhythm(rows: { presentCount: number; absentCount: number; excusedCount: number }[]): string {
  if (rows.length === 0) return "No recent sessions";
  const presentTotals = rows.map((r) => r.presentCount);
  const avg = presentTotals.reduce((sum, n) => sum + n, 0) / presentTotals.length;
  const latest = presentTotals[0];
  if (Math.abs(latest - avg) <= 1) return "Steady";
  return latest > avg ? "Growing" : "Dipping";
}

export async function getAdminDashboardData(
  client: AppSupabaseClient | null,
): Promise<DashboardResult<AdminDashboardData>> {
  if (!client) return fallback(ADMIN_FALLBACK);

  try {
    const [
      groupsResult,
      activeGroupCountResult,
      latestWeekResult,
      guestsResult,
      followUpsResult,
      membershipsResult,
      healthUpdatesResult,
    ] = await Promise.all([
      fetchAllGroups(client),
      fetchActiveGroupCount(client),
      fetchLatestMeetingWeek(client),
      fetchGuests(client),
      fetchOpenFollowUps(client, { limit: 8 }),
      fetchActiveMemberships(client),
      fetchLatestHealthUpdates(client),
    ]);

    const firstError =
      groupsResult.error ||
      activeGroupCountResult.error ||
      latestWeekResult.error ||
      guestsResult.error ||
      followUpsResult.error ||
      membershipsResult.error ||
      healthUpdatesResult.error;
    if (firstError) return fallback(ADMIN_FALLBACK, firstError.message);

    const groups = groupsResult.data ?? [];
    const guests = guestsResult.data ?? [];
    const followUps = followUpsResult.data ?? [];
    const memberships = membershipsResult.data ?? [];
    const healthUpdates = healthUpdatesResult.data ?? [];

    const groupsById = new Map(groups.map((g) => [g.id, g] as const));
    const activeGroups = groups.filter((g) => g.lifecycle_status === "active");
    const activeGroupIds = new Set(activeGroups.map((g) => g.id));

    const latestWeek = latestWeekResult.data ?? isoWeekStart(new Date());

    const sessionsThisWeekResult = await fetchAttendanceSessions(client, { meetingWeek: latestWeek });
    if (sessionsThisWeekResult.error) return fallback(ADMIN_FALLBACK, sessionsThisWeekResult.error.message);
    const sessionsThisWeek = sessionsThisWeekResult.data ?? [];

    let attendanceThisWeek = 0;
    if (sessionsThisWeek.length > 0) {
      const ids = sessionsThisWeek.map((s) => s.id);
      const recordsResult = await fetchAttendanceRecordsForSessions(client, ids);
      if (recordsResult.error) return fallback(ADMIN_FALLBACK, recordsResult.error.message);
      attendanceThisWeek = (recordsResult.data ?? []).filter(
        (r: AttendanceRecordsRow) => r.attendance_status === "present",
      ).length;
    }

    const sessionsThisWeekForActive = sessionsThisWeek.filter((s) => activeGroupIds.has(s.group_id));
    const notSubmittedSessions = sessionsThisWeekForActive.filter((s) => s.status === "not_submitted").length;
    const groupsWithoutSession = Math.max(0, activeGroups.length - sessionsThisWeekForActive.length);
    const missingCheckInsCount = notSubmittedSessions + groupsWithoutSession;

    const pipelineBreakdown = countPipeline(GUEST_PIPELINE_STAGES, guests);
    const guestPipelineCount = guests.filter(
      (g) => g.pipeline_stage !== "placed" && g.pipeline_stage !== "not_now",
    ).length;

    const latestHealthByGroup = new Map<string, GroupHealthUpdatesRow>();
    for (const update of healthUpdates) {
      const existing = latestHealthByGroup.get(update.group_id);
      if (!existing || update.update_week > existing.update_week) {
        latestHealthByGroup.set(update.group_id, update);
      }
    }

    const groupHealth = groups
      .filter((g) => g.lifecycle_status !== "closed")
      .map((g) => ({
        groupId: g.id,
        name: g.name,
        lifecycleStatus: g.lifecycle_status,
        healthStatus: latestHealthByGroup.get(g.id)?.pulse ?? g.health_status,
      }));

    const membershipCountsByGroup = new Map<string, number>();
    for (const m of memberships as GroupMembershipsRow[]) {
      membershipCountsByGroup.set(m.group_id, (membershipCountsByGroup.get(m.group_id) ?? 0) + 1);
    }

    const capacityRows: CapacityRow[] = groups
      .filter((g) => g.lifecycle_status === "active")
      .map((g) => {
        const activeMembers = membershipCountsByGroup.get(g.id) ?? 0;
        const utilization = g.capacity && g.capacity > 0 ? activeMembers / g.capacity : null;
        return {
          groupId: g.id,
          name: g.name,
          activeMembers,
          capacity: g.capacity,
          utilization,
          healthStatus: latestHealthByGroup.get(g.id)?.pulse ?? g.health_status,
        };
      })
      .sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0));

    const fullGroups = capacityRows.filter(
      (r) => r.healthStatus === "capacity_full" || (r.utilization !== null && r.utilization >= 1),
    ).length;
    const nearCapacityGroups = capacityRows.filter(
      (r) => r.utilization !== null && r.utilization >= NEAR_CAPACITY_THRESHOLD && r.utilization < 1,
    ).length;

    const followUpItems = followUps.map((row: FollowUpsRow) => toFollowUpItem(row, groupsById));

    return live({
      activeGroupCount: activeGroupCountResult.data ?? 0,
      attendanceThisWeek,
      guestPipelineCount,
      missingCheckInsCount,
      weekLabel: `week of ${describeWeek(latestWeek)}`,
      groupHealth,
      capacity: {
        totalActiveGroups: activeGroupCountResult.data ?? capacityRows.length,
        nearCapacityGroups,
        fullGroups,
        rows: capacityRows.slice(0, 6),
      },
      guestPipelineBreakdown: pipelineBreakdown,
      followUps: followUpItems,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fallback(ADMIN_FALLBACK, message);
  }
}

async function buildLeaderGroupDashboard(
  client: AppSupabaseClient,
  group: GroupsRow,
): Promise<LeaderGroupDashboard> {
  const [sessionsResult, membershipsResult, healthUpdatesResult, followUpsResult] = await Promise.all([
    fetchAttendanceSessions(client, { groupId: group.id, limit: 8 }),
    fetchActiveMemberships(client, { groupId: group.id }),
    fetchLatestHealthUpdates(client, { groupId: group.id }),
    fetchOpenFollowUps(client, { groupId: group.id, limit: 6 }),
  ]);

  const firstError =
    sessionsResult.error ||
    membershipsResult.error ||
    healthUpdatesResult.error ||
    followUpsResult.error;
  if (firstError) throw firstError;

  const sessions = sessionsResult.data ?? [];
  const memberships = membershipsResult.data ?? [];
  const healthUpdates = healthUpdatesResult.data ?? [];
  const followUps = followUpsResult.data ?? [];

  const memberIds = memberships.map((m: GroupMembershipsRow) => m.member_id);
  const membersResult = await fetchMembersByIds(client, memberIds);
  if (membersResult.error) throw membersResult.error;
  const members = (membersResult.data ?? []) as MembersRow[];

  let recordsByMember: AttendanceRecordsRow[] = [];
  if (sessions.length > 0) {
    const recordsResult = await fetchAttendanceRecordsForSessions(
      client,
      sessions.map((s) => s.id),
    );
    if (recordsResult.error) throw recordsResult.error;
    recordsByMember = recordsResult.data ?? [];
  }

  const recentSessions = sessions.slice(0, 4).map((session) => {
    const recs = recordsByMember.filter((r) => r.session_id === session.id);
    return {
      meetingWeek: session.meeting_week,
      status: session.status,
      presentCount: recs.filter((r) => r.attendance_status === "present").length,
      absentCount: recs.filter((r) => r.attendance_status === "absent").length,
      excusedCount: recs.filter((r) => r.attendance_status === "excused").length,
    };
  });

  const latestHealth = healthUpdates[0];
  const latestWeekIso = sessions[0]?.meeting_week ?? isoWeekStart(new Date());
  const currentWeekIso = isoWeekStart(new Date());

  const newGuestsResult = await fetchNewGuestsForGroupSince(client, group.id, currentWeekIso);
  if (newGuestsResult.error) throw newGuestsResult.error;
  const newGuestsThisWeek = (newGuestsResult.data ?? []).length;

  const followUpItems = followUps.map((row: FollowUpsRow) =>
    toFollowUpItem(row, new Map([[group.id, group]])),
  );

  const memberList = members
    .map((m) => ({ id: m.id, displayName: shortenName(m.full_name) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const rhythm = computeAttendanceRhythm(recentSessions);

  return {
    group: {
      groupId: group.id,
      name: group.name,
      meetingDay: group.meeting_day,
      meetingTime: group.meeting_time,
      lifecycleStatus: group.lifecycle_status,
      healthStatus: latestHealth?.pulse ?? group.health_status,
      capacity: group.capacity,
      activeMembers: memberships.length,
      weekLabel: `Week of ${describeWeek(latestWeekIso)}`,
      members: memberList,
    },
    recentSessions,
    healthPulse: {
      attendanceRhythm: rhythm,
      newGuestsThisWeek,
      currentHealth: latestHealth?.pulse ?? group.health_status,
      leaderNote: latestHealth?.leader_note ?? null,
    },
    followUps: followUpItems,
  };
}

export async function getLeaderDashboardData(
  client: AppSupabaseClient | null,
  options: { assignedGroupIds: readonly string[] },
): Promise<DashboardResult<LeaderDashboardData>> {
  if (!client) return fallback(LEADER_FALLBACK);
  if (options.assignedGroupIds.length === 0) return live({ groups: [] });

  try {
    const groupsResult = await fetchGroupsByIds(client, [...options.assignedGroupIds]);
    if (groupsResult.error) return fallback(LEADER_FALLBACK, groupsResult.error.message);
    const groups = groupsResult.data ?? [];
    if (groups.length === 0) return live({ groups: [] });

    const dashboards = await Promise.all(groups.map((g) => buildLeaderGroupDashboard(client, g)));
    return live({ groups: dashboards });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fallback(LEADER_FALLBACK, message);
  }
}
