// NOTE: deliberately NOT marked "server-only" — pure helpers/types in this
// module are still value-imported by client-bundled dashboard demo/fixture
// code; splitting those out is tracked by the #816 module-split work.
import type {
  AttendanceRecordsRow,
  AttendanceSessionsRow,
} from "@/types/database";
import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// Column allowlist for the attendance-session fetcher (#495); every
// AttendanceSessionsRow column (the admin review surfaces render both the
// leader_note and admin_note), pinned by a colocated test.
export const ATTENDANCE_SESSION_COLUMNS = columns<AttendanceSessionsRow>()(
  "id",
  "group_id",
  "meeting_week",
  "meeting_date",
  "status",
  "submitted_by",
  "submitted_at",
  "leader_note",
  "admin_note",
  "created_at",
  "updated_at"
);

export async function fetchAttendanceSessions(
  client: ReadClient,
  options: { groupId?: string; meetingWeek?: string; limit?: number } = {}
): Promise<ReadResult<AttendanceSessionsRow[]>> {
  let query = client
    .from("attendance_sessions")
    .select(ATTENDANCE_SESSION_COLUMNS.select)
    .order("meeting_week", { ascending: false });
  if (options.groupId) query = query.eq("group_id", options.groupId);
  if (options.meetingWeek)
    query = query.eq("meeting_week", options.meetingWeek);
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query.returns<AttendanceSessionsRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchAttendanceSessions", error) };
  return { data: data ?? [], error: null };
}

export async function fetchLatestMeetingWeek(
  client: ReadClient
): Promise<ReadResult<string | null>> {
  const { data, error } = await client
    .from("attendance_sessions")
    .select("meeting_week")
    .order("meeting_week", { ascending: false })
    .limit(1)
    .returns<{ meeting_week: string }[]>();
  if (error)
    return { data: null, error: wrapError("fetchLatestMeetingWeek", error) };
  if (!data || data.length === 0) return { data: null, error: null };
  return { data: data[0].meeting_week, error: null };
}

// Column allowlist for the attendance-record fetcher (#495); every
// AttendanceRecordsRow column, pinned by a colocated test.
export const ATTENDANCE_RECORD_COLUMNS = columns<AttendanceRecordsRow>()(
  "id",
  "session_id",
  "member_id",
  "attendance_status",
  "created_at"
);

export async function fetchAttendanceRecordsForSessions(
  client: ReadClient,
  sessionIds: string[]
): Promise<ReadResult<AttendanceRecordsRow[]>> {
  if (sessionIds.length === 0) return { data: [], error: null };
  // Widen past the PostgREST default 1000-row cap (see GUEST_PAGE_LIMIT note
  // below). A week-wide admin review across many groups can approach the cap
  // even at modest deployment sizes; explicit range keeps results stable.
  const { data, error } = await client
    .from("attendance_records")
    .select(ATTENDANCE_RECORD_COLUMNS.select)
    .in("session_id", sessionIds)
    .range(0, 9999)
    .returns<AttendanceRecordsRow[]>();
  if (error)
    return {
      data: null,
      error: wrapError("fetchAttendanceRecordsForSessions", error),
    };
  return { data: data ?? [], error: null };
}
