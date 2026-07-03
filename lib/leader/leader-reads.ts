// The Leader surface's reads seam (ADR 0015, #821 / audit ARCH-10).
//
// The leader pages (landing, care, calendar, check-in) read only through
// shared leaf fetchers whose row scoping is enforced by the leader-scoped RLS
// (auth_is_leader_of). This map binds those fetchers with the "leader" label
// so read_unit slow/fail timing covers the surface like the 20 admin bindings
// do — server read latency is a documented production signal. Column
// allowlists live with each leaf fetcher; nothing here widens a read.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import { bindReads, type BoundReads } from "@/lib/supabase/reads-seam";
import { fetchLeaderGroupsByIds } from "@/lib/supabase/group-reads";
import {
  fetchGroupCareNotes,
  fetchGroupPrayerRequests,
} from "@/lib/supabase/care-note-reads";
import {
  fetchActiveMemberships,
  fetchMembersByIds,
} from "@/lib/supabase/membership-reads";
import {
  fetchAttendanceRecordsForSessions,
  fetchAttendanceSessions,
} from "@/lib/supabase/attendance-reads";
import { fetchLatestHealthUpdates } from "@/lib/supabase/health-reads";
import { fetchGroupCalendarEvents } from "@/lib/supabase/calendar-reads";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";

// Deliberately NO full-projection group reader here: leader routes read groups
// only through fetchLeaderGroupsByIds (LEADER_SAFE_GROUP_COLUMNS), so the
// admin-only groups.admin_notes column can never reach a leader context via
// this map (group RLS filters rows, not columns).
const LEADER_FETCHERS = {
  fetchLeaderGroupsByIds,
  fetchGroupCareNotes,
  fetchGroupPrayerRequests,
  // Check-in page reads (the surface stays behind its own check_ins gate).
  fetchActiveMemberships,
  fetchMembersByIds,
  fetchAttendanceSessions,
  fetchAttendanceRecordsForSessions,
  fetchLatestHealthUpdates,
  fetchGroupCalendarEvents,
  fetchMetricDefaultsCached,
};

export type LeaderReads = BoundReads<typeof LEADER_FETCHERS>;

export function bindLeaderReads(client: AppSupabaseClient): LeaderReads {
  return bindReads(client, LEADER_FETCHERS, "leader");
}
