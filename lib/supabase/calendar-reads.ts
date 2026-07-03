// NOTE: deliberately NOT marked "server-only" — pure helpers/types in this
// module are still value-imported by client-bundled dashboard demo/fixture
// code; splitting those out is tracked by the #816 module-split work.
import type { GroupCalendarEventsRow } from "@/types/database";
import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// Phase 5A.6 group calendar readers. RLS already scopes these to
// admin / leader-of-group via the SELECT policies in
// supabase/migrations/20260518140000_phase5a6_group_calendar.sql, so
// callers can pass arbitrary filters and the database enforces access.
//
// Archive filter precedence: archivedOnly > includeArchived. Use
// archivedOnly:true for the leader / admin "Archived" tabs; the
// includeArchived:true escape hatch returns both active and archived
// rows and is reserved for surfaces that explicitly want the full set
// (none in this phase).
export type CalendarEventReadOptions = {
  groupId?: string;
  groupIds?: string[];
  fromDate?: string; // YYYY-MM-DD inclusive
  toDate?: string; // YYYY-MM-DD inclusive
  includeArchived?: boolean; // default false (active only)
  archivedOnly?: boolean; // when true, returns only archived rows
};

// Match the fetchAttendanceRecordsForSessions defensive cap so a
// week-wide admin batch (events across all groups) can't silently
// truncate at PostgREST's default 1000-row cap. The override resolver
// depends on a *complete* per-group event set -- truncation would
// produce some groups evaluated as if they had no calendar override.
const CALENDAR_EVENTS_PAGE_LIMIT = 10000;

// Column allowlist for the group-calendar fetcher (#495); every
// GroupCalendarEventsRow column, pinned by a colocated test. This read is
// reachable from both admin and leader calendar surfaces, so the pin matters
// doubly: a future admin-only calendar column added to the table cannot flow
// into a leader context without showing up as a deliberate diff here.
export const GROUP_CALENDAR_EVENT_COLUMNS = columns<GroupCalendarEventsRow>()(
  "id",
  "group_id",
  "event_date",
  "start_time",
  "end_time",
  "event_type",
  "status",
  "title",
  "description",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
  "archived_at"
);

export async function fetchGroupCalendarEvents(
  client: ReadClient,
  options: CalendarEventReadOptions = {}
): Promise<ReadResult<GroupCalendarEventsRow[]>> {
  let query = client
    .from("group_calendar_events")
    .select(GROUP_CALENDAR_EVENT_COLUMNS.select)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true });
  if (options.groupId) query = query.eq("group_id", options.groupId);
  if (options.groupIds) {
    if (options.groupIds.length === 0) return { data: [], error: null };
    query = query.in("group_id", options.groupIds);
  }
  if (options.fromDate) query = query.gte("event_date", options.fromDate);
  if (options.toDate) query = query.lte("event_date", options.toDate);
  if (options.archivedOnly) {
    query = query.not("archived_at", "is", null);
  } else if (!options.includeArchived) {
    query = query.is("archived_at", null);
  }
  query = query.range(0, CALENDAR_EVENTS_PAGE_LIMIT - 1);
  const { data, error } = await query.returns<GroupCalendarEventsRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchGroupCalendarEvents", error) };
  return { data: data ?? [], error: null };
}

export async function fetchUpcomingCalendarEventsForGroups(
  client: ReadClient,
  groupIds: string[],
  fromDate: string,
  toDate: string
): Promise<ReadResult<GroupCalendarEventsRow[]>> {
  if (groupIds.length === 0) return { data: [], error: null };
  return fetchGroupCalendarEvents(client, {
    groupIds,
    fromDate,
    toDate,
    includeArchived: false,
  });
}
