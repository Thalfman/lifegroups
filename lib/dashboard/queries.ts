import { getReadClient } from "@/lib/supabase/client";
import {
  GUEST_PIPELINE_STAGES,
  fetchActiveGroupCount,
  fetchActiveMemberships,
  fetchAllGroups,
  fetchAttendanceRecordsForSessions,
  fetchAttendanceSessions,
  fetchFirstAssignedGroupForAnyLeader,
  fetchGuests,
  fetchLatestHealthUpdates,
  fetchMembersByIds,
  fetchOpenFollowUps,
} from "@/lib/supabase/read-models";
import type { ReadClient } from "@/lib/supabase/client";
import type {
  AdminDashboardData,
  CapacityRow,
  DashboardResult,
  FollowUpItem,
  LeaderDashboardData,
  PipelineStageCount,
} from "./types";
import { ADMIN_FALLBACK, LEADER_FALLBACK } from "./fallback-data";
import { pipelineStageLabel } from "./labels";
import type {
  AttendanceRecordsRow,
  AttendanceSessionsRow,
  FollowUpsRow,
  GroupHealthUpdatesRow,
  GroupMembershipsRow,
  GroupsRow,
  MembersRow,
} from "@/types/database";
import type { GuestPipelineStage } from "@/types/enums";

const NEAR_CAPACITY_THRESHOLD = 0.8;

function isoWeekStart(date: Date): string {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = copy.getUTCDay();
  const sundayOffset = dayOfWeek; // attendance_sessions.meeting_week is stored as the meeting week's Sunday date in seed data
  copy.setUTCDate(copy.getUTCDate() - sundayOffset);
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

function pickLatestSessionWeek(sessions: AttendanceSessionsRow[]): string | null {
  if (sessions.length === 0) return null;
  return sessions.reduce((latest, current) => {
    return current.meeting_week > latest ? current.meeting_week : latest;
  }, sessions[0].meeting_week);
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

export async function getAdminDashboardData(): Promise<DashboardResult<AdminDashboardData>> {
  const client = getReadClient();
  if (!client) return fallback(ADMIN_FALLBACK);

  try {
    const [
      groupsResult,
      activeGroupCountResult,
      sessionsResult,
      guestsResult,
      followUpsResult,
      membershipsResult,
      healthUpdatesResult,
    ] = await Promise.all([
      fetchAllGroups(client),
      fetchActiveGroupCount(client),
      fetchAttendanceSessions(client, { limit: 200 }),
      fetchGuests(client),
      fetchOpenFollowUps(client, { limit: 8 }),
      fetchActiveMemberships(client),
      fetchLatestHealthUpdates(client),
    ]);

    const firstError =
      groupsResult.error ||
      activeGroupCountResult.error ||
      sessionsResult.error ||
      guestsResult.error ||
      followUpsResult.error ||
      membershipsResult.error ||
      healthUpdatesResult.error;
    if (firstError) return fallback(ADMIN_FALLBACK, firstError.message);

    const groups = groupsResult.data ?? [];
    const sessions = sessionsResult.data ?? [];
    const guests = guestsResult.data ?? [];
    const followUps = followUpsResult.data ?? [];
    const memberships = membershipsResult.data ?? [];
    const healthUpdates = healthUpdatesResult.data ?? [];

    const groupsById = new Map(groups.map((g) => [g.id, g] as const));

    const latestWeek = pickLatestSessionWeek(sessions) ?? isoWeekStart(new Date());
    const sessionsThisWeek = sessions.filter((s) => s.meeting_week === latestWeek);

    let attendanceThisWeek = 0;
    let missingCheckInsCount = sessionsThisWeek.filter((s) => s.status === "not_submitted").length;
    if (sessionsThisWeek.length > 0) {
      const ids = sessionsThisWeek.map((s) => s.id);
      const recordsResult = await fetchAttendanceRecordsForSessions(client, ids);
      if (recordsResult.error) return fallback(ADMIN_FALLBACK, recordsResult.error.message);
      attendanceThisWeek = (recordsResult.data ?? []).filter(
        (r: AttendanceRecordsRow) => r.attendance_status === "present",
      ).length;
    }

    if (missingCheckInsCount === 0 && sessionsThisWeek.length < groups.filter((g) => g.lifecycle_status === "active").length) {
      missingCheckInsCount =
        groups.filter((g) => g.lifecycle_status === "active").length - sessionsThisWeek.length;
    }

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

    const fullGroups = capacityRows.filter((r) => r.healthStatus === "capacity_full" || r.utilization === 1).length;
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

async function loadGroupForLeader(client: ReadClient): Promise<GroupsRow | null> {
  const assignedResult = await fetchFirstAssignedGroupForAnyLeader(client);
  if (assignedResult.error) throw assignedResult.error;
  const assigned = assignedResult.data;

  const groupsResult = await fetchAllGroups(client);
  if (groupsResult.error) throw groupsResult.error;
  const groups = groupsResult.data ?? [];
  if (groups.length === 0) return null;

  if (assigned) {
    const found = groups.find((g) => g.id === assigned.groupId);
    if (found) return found;
  }
  return groups.find((g) => g.lifecycle_status === "active") ?? groups[0];
}

export async function getLeaderDashboardData(): Promise<DashboardResult<LeaderDashboardData>> {
  const client = getReadClient();
  if (!client) return fallback(LEADER_FALLBACK);

  try {
    const group = await loadGroupForLeader(client);
    if (!group) {
      return live({ group: null, recentSessions: [], healthPulse: LEADER_FALLBACK.healthPulse, followUps: [] });
    }

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

    const followUpItems = followUps.map((row: FollowUpsRow) =>
      toFollowUpItem(row, new Map([[group.id, group]])),
    );

    const memberNames = members
      .map((m) => shortenName(m.full_name))
      .sort((a, b) => a.localeCompare(b));

    const rhythm = computeAttendanceRhythm(recentSessions);

    return live({
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
        memberNames,
      },
      recentSessions,
      healthPulse: {
        attendanceRhythm: rhythm,
        newGuestsThisWeek: 0,
        currentHealth: latestHealth?.pulse ?? group.health_status,
        leaderNote: latestHealth?.leader_note ?? null,
      },
      followUps: followUpItems,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fallback(LEADER_FALLBACK, message);
  }
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
