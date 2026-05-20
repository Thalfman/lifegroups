// Phase 5A.7 — Admin master calendar composition helper.
//
// Loads the ministry-wide month of occurrences for /admin/calendar by
// reusing the Phase 5A.6 occurrence generation + override merge helpers
// for each non-closed group and flattening the results.
//
// This module is read-only by design. The master calendar surface is an
// oversight tool: clicks deep-link into the per-group calendar where
// the existing edit RPCs already live. No writes happen here.

import {
  fetchAllGroupLeaders,
  fetchAllGroups,
  fetchGroupCalendarEvents,
  fetchProfilesForAdmin,
} from "@/lib/supabase/read-models";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  generateMonthOccurrences,
  mergeOverrides,
  monthBounds,
  toSavedOverrides,
} from "@/lib/calendar/occurrences";
import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
  GroupLifecycleStatus,
  MeetingFrequency,
  MeetingWeekParity,
} from "@/types/enums";

// Strict shape: only fields the calendar UI renders. We do not surface
// admin_notes (groups), admin_private_note (follow_ups, irrelevant
// here), or any other admin-only fields.
export type MasterCalendarGroupSummary = {
  groupId: string;
  groupName: string;
  lifecycleStatus: GroupLifecycleStatus;
  meetingDay: string | null;
  meetingTime: string | null;
  meetingFrequency: MeetingFrequency;
  meetingWeekParity: MeetingWeekParity | null;
  leaderNames: string[];
};

export type MasterOccurrence = MasterCalendarGroupSummary & {
  date: string; // YYYY-MM-DD
  inheritedMeetingTime: string | null;
  eventType: GroupCalendarEventType;
  status: GroupCalendarEventStatus;
  title: string | null;
  description: string | null;
  overrideId: string | null;
  isGenerated: boolean; // overrideId === null
  isMeetingOccurrence: boolean;
};

export type MasterCalendarData = {
  occurrences: MasterOccurrence[];
  groups: MasterCalendarGroupSummary[];
  leaderNamesUnique: string[];
};

export async function loadMasterCalendar(
  client: AppSupabaseClient,
  { monthIso }: { monthIso: string },
): Promise<MasterCalendarData> {
  const bounds = monthBounds(monthIso);
  if (!bounds) {
    return { occurrences: [], groups: [], leaderNamesUnique: [] };
  }

  const [groupsResult, leadersResult, profilesResult] = await Promise.all([
    fetchAllGroups(client),
    fetchAllGroupLeaders(client, { activeOnly: true }),
    fetchProfilesForAdmin(client, {
      roles: ["leader", "co_leader"],
      statuses: ["active", "inactive"],
    }),
  ]);
  if (groupsResult.error) throw groupsResult.error;
  if (leadersResult.error) throw leadersResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const visibleGroups = (groupsResult.data ?? []).filter(
    (g) => g.lifecycle_status !== "closed",
  );
  if (visibleGroups.length === 0) {
    return { occurrences: [], groups: [], leaderNamesUnique: [] };
  }

  const profileNameById = new Map<string, string>();
  for (const p of profilesResult.data ?? []) {
    const display = p.full_name?.trim() || p.email || "Unknown";
    profileNameById.set(p.id, display);
  }

  const leadersByGroup = new Map<string, string[]>();
  for (const row of leadersResult.data ?? []) {
    if (!row.active) continue;
    if (row.role !== "leader" && row.role !== "co_leader") continue;
    const name = profileNameById.get(row.profile_id);
    if (!name) continue;
    const bucket = leadersByGroup.get(row.group_id) ?? [];
    if (!bucket.includes(name)) bucket.push(name);
    leadersByGroup.set(row.group_id, bucket);
  }

  const groupIds = visibleGroups.map((g) => g.id);
  const eventsResult = await fetchGroupCalendarEvents(client, {
    groupIds,
    fromDate: bounds.firstIso,
    toDate: bounds.lastIso,
  });
  if (eventsResult.error) throw eventsResult.error;

  const eventsByGroup = new Map<string, typeof eventsResult.data>();
  for (const ev of eventsResult.data ?? []) {
    const bucket = eventsByGroup.get(ev.group_id) ?? [];
    bucket.push(ev);
    eventsByGroup.set(ev.group_id, bucket);
  }

  const groupSummaries: MasterCalendarGroupSummary[] = visibleGroups.map(
    (g) => ({
      groupId: g.id,
      groupName: g.name,
      lifecycleStatus: g.lifecycle_status,
      meetingDay: g.meeting_day,
      meetingTime: g.meeting_time,
      meetingFrequency: g.meeting_frequency,
      meetingWeekParity: g.meeting_week_parity,
      leaderNames: (leadersByGroup.get(g.id) ?? [])
        .slice()
        .sort((a, b) => a.localeCompare(b)),
    }),
  );

  const occurrences: MasterOccurrence[] = [];
  for (const group of visibleGroups) {
    const summary = groupSummaries.find((s) => s.groupId === group.id);
    if (!summary) continue;
    const generated = generateMonthOccurrences(
      {
        meetingDay: group.meeting_day,
        meetingTime: group.meeting_time,
        meetingFrequency: group.meeting_frequency,
        meetingWeekParity: group.meeting_week_parity,
      },
      monthIso,
    );
    const saved = toSavedOverrides(eventsByGroup.get(group.id) ?? []);
    const resolved = mergeOverrides(generated, saved, group.meeting_time);
    for (const r of resolved) {
      occurrences.push({
        ...summary,
        date: r.date,
        inheritedMeetingTime: r.meetingTime,
        eventType: r.eventType,
        status: r.status,
        title: r.title,
        description: r.description,
        overrideId: r.overrideId,
        isGenerated: r.overrideId === null,
        isMeetingOccurrence: r.isMeetingOccurrence,
      });
    }
  }

  occurrences.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.groupName.localeCompare(b.groupName);
  });

  const leaderNamesUnique = Array.from(
    new Set(groupSummaries.flatMap((g) => g.leaderNames)),
  ).sort((a, b) => a.localeCompare(b));

  return {
    occurrences,
    groups: groupSummaries,
    leaderNamesUnique,
  };
}
