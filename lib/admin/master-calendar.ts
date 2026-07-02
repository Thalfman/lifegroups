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
} from "@/lib/supabase/group-reads";
import { fetchProfilesForAdmin } from "@/lib/supabase/membership-reads";
import { fetchGroupCalendarEvents } from "@/lib/supabase/calendar-reads";
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

// Leader identity carries both profile_id (stable filter key) and the
// rendered display name. Two leaders with the same full_name remain
// distinct because we key on profileId, not name.
export type MasterCalendarLeader = {
  profileId: string;
  name: string;
};

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
  leaders: MasterCalendarLeader[];
};

export type MasterOccurrence = MasterCalendarGroupSummary & {
  date: string; // YYYY-MM-DD
  weekdayIndex: number; // 0=Sun..6=Sat, derived from `date` (UTC)
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
  // Unique leaders across all visible groups, deduped by profileId.
  // Two profiles sharing a display name remain distinct entries.
  leaderOptions: MasterCalendarLeader[];
};

function weekdayIndexFromIso(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export async function loadMasterCalendar(
  client: AppSupabaseClient,
  { monthIso }: { monthIso: string }
): Promise<MasterCalendarData> {
  const bounds = monthBounds(monthIso);
  if (!bounds) {
    return { occurrences: [], groups: [], leaderOptions: [] };
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
    (g) => g.lifecycle_status !== "closed"
  );
  if (visibleGroups.length === 0) {
    return { occurrences: [], groups: [], leaderOptions: [] };
  }

  const profileNameById = new Map<string, string>();
  for (const p of profilesResult.data ?? []) {
    const display = p.full_name?.trim() || p.email || "Unknown";
    profileNameById.set(p.id, display);
  }

  // Dedupe assignments by profile_id so two distinct profiles with the
  // same display name remain separate entries. A group can list the
  // same profile only once even if there are multiple active rows.
  const leadersByGroup = new Map<string, Map<string, MasterCalendarLeader>>();
  for (const row of leadersResult.data ?? []) {
    if (!row.active) continue;
    if (row.role !== "leader" && row.role !== "co_leader") continue;
    const name = profileNameById.get(row.profile_id);
    if (!name) continue;
    const bucket =
      leadersByGroup.get(row.group_id) ??
      new Map<string, MasterCalendarLeader>();
    if (!bucket.has(row.profile_id)) {
      bucket.set(row.profile_id, { profileId: row.profile_id, name });
    }
    leadersByGroup.set(row.group_id, bucket);
  }

  const groupIds = visibleGroups.map((g) => g.id);
  const eventsResult = await fetchGroupCalendarEvents(client, {
    groupIds,
    fromDate: bounds.firstIso,
    toDate: bounds.lastIso,
  });
  if (eventsResult.error) throw eventsResult.error;

  const eventsByGroup = new Map<
    string,
    NonNullable<typeof eventsResult.data>
  >();
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
      leaders: Array.from(
        (leadersByGroup.get(g.id) ?? new Map()).values()
      ).sort((a, b) => a.name.localeCompare(b.name)),
    })
  );

  // Iterate groupSummaries directly (O(N) total over groups) instead of
  // looking each summary up by id (which would be O(N^2)).
  const occurrences: MasterOccurrence[] = [];
  for (const summary of groupSummaries) {
    const generated = generateMonthOccurrences(
      {
        meetingDay: summary.meetingDay,
        meetingTime: summary.meetingTime,
        meetingFrequency: summary.meetingFrequency,
        meetingWeekParity: summary.meetingWeekParity,
      },
      monthIso
    );
    const saved = toSavedOverrides(eventsByGroup.get(summary.groupId) ?? []);
    const resolved = mergeOverrides(generated, saved, summary.meetingTime);
    for (const r of resolved) {
      occurrences.push({
        ...summary,
        date: r.date,
        weekdayIndex: weekdayIndexFromIso(r.date),
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

  const sortedOccurrences = [...occurrences].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.groupName.localeCompare(b.groupName);
  });

  // Build the unique leader options list: dedupe by profileId across
  // every visible group's leader list. Distinct profiles with the same
  // display name stay as separate entries.
  const leaderOptionsMap = new Map<string, MasterCalendarLeader>();
  for (const group of groupSummaries) {
    for (const l of group.leaders) {
      if (!leaderOptionsMap.has(l.profileId)) {
        leaderOptionsMap.set(l.profileId, l);
      }
    }
  }
  const leaderOptions = Array.from(leaderOptionsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return {
    occurrences: sortedOccurrences,
    groups: groupSummaries,
    leaderOptions,
  };
}
