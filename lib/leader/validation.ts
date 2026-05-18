// Phase 5B.0 validation contracts for the leader weekly check-in. Pure
// TypeScript, no I/O. Used by the server action before it hits the RPC
// boundary. The RPC re-validates everything at the database layer.

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SESSION_STATUSES = ["submitted", "did_not_meet", "planned_pause"] as const;
export type LeaderSessionStatus = (typeof SESSION_STATUSES)[number];

const PULSE_VALUES = ["healthy", "watch", "needs_follow_up"] as const;
export type LeaderPulseValue = (typeof PULSE_VALUES)[number];

const ATTENDANCE_VALUES = ["present", "absent", "excused"] as const;
export type LeaderAttendanceValue = (typeof ATTENDANCE_VALUES)[number];

export type LeaderCheckinAttendanceEntry = {
  member_id: string;
  attendance_status: LeaderAttendanceValue;
};

export type LeaderCheckinPayload = {
  group_id: string;
  meeting_week: string;
  meeting_date: string | null;
  status: LeaderSessionStatus;
  leader_note: string | null;
  pulse: LeaderPulseValue | null;
  follow_up_needed: boolean;
  attendance: LeaderCheckinAttendanceEntry[];
};

const LEADER_NOTE_MAX = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  // Reject obviously-bogus calendar values like 2026-13-40.
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function normalizeUuid(value: string): string {
  return value.toLowerCase();
}

function readBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "on" || v === "1" || v === "yes";
  }
  return false;
}

function readOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isSessionStatus(value: unknown): value is LeaderSessionStatus {
  return typeof value === "string" && (SESSION_STATUSES as readonly string[]).includes(value);
}

function isPulse(value: unknown): value is LeaderPulseValue {
  return typeof value === "string" && (PULSE_VALUES as readonly string[]).includes(value);
}

function isAttendanceValue(value: unknown): value is LeaderAttendanceValue {
  return (
    typeof value === "string" &&
    (ATTENDANCE_VALUES as readonly string[]).includes(value)
  );
}

function readAttendance(raw: unknown): {
  entries: LeaderCheckinAttendanceEntry[];
  errors: string[];
} {
  if (raw === undefined || raw === null) return { entries: [], errors: [] };
  if (!Array.isArray(raw))
    return { entries: [], errors: ["Attendance data was malformed."] };

  const seen = new Set<string>();
  const entries: LeaderCheckinAttendanceEntry[] = [];
  const errors: string[] = [];

  for (const item of raw) {
    if (!isRecord(item)) {
      errors.push("Attendance data was malformed.");
      continue;
    }
    const memberId = item.member_id;
    const status = item.attendance_status;
    if (!isUuid(memberId)) {
      errors.push("One attendance row had an invalid member id.");
      continue;
    }
    if (!isAttendanceValue(status)) {
      errors.push("One attendance row had an invalid status.");
      continue;
    }
    const normalized = normalizeUuid(memberId);
    if (seen.has(normalized)) {
      // Last entry wins; the RPC also de-dupes server-side.
      // Replace the prior entry to keep client and server in sync.
      const existing = entries.findIndex((e) => e.member_id === normalized);
      if (existing >= 0) entries[existing] = { member_id: normalized, attendance_status: status };
      continue;
    }
    seen.add(normalized);
    entries.push({ member_id: normalized, attendance_status: status });
  }

  return { entries, errors };
}

export function validateLeaderCheckinPayload(
  input: unknown,
): ValidationResult<LeaderCheckinPayload> {
  if (!isRecord(input)) {
    return { ok: false, errors: ["The check-in payload was malformed."] };
  }

  const errors: string[] = [];

  const groupId = input.group_id;
  const meetingWeek = input.meeting_week;
  const meetingDateRaw = input.meeting_date;
  const status = input.status;
  const leaderNote = readOptionalString(input.leader_note);
  const pulseRaw = input.pulse;
  const followUp = readBool(input.follow_up_needed);

  if (!isUuid(groupId)) errors.push("The group reference was invalid.");
  if (!isIsoDate(meetingWeek)) errors.push("The meeting week was invalid.");
  if (!isSessionStatus(status))
    errors.push("Choose whether the group met, didn't meet, or paused.");

  let meetingDate: string | null = null;
  if (meetingDateRaw !== undefined && meetingDateRaw !== null && meetingDateRaw !== "") {
    if (!isIsoDate(meetingDateRaw)) {
      errors.push("The meeting date was invalid.");
    } else {
      meetingDate = meetingDateRaw as string;
    }
  }

  let pulse: LeaderPulseValue | null = null;
  if (pulseRaw !== undefined && pulseRaw !== null && pulseRaw !== "") {
    if (!isPulse(pulseRaw)) {
      errors.push("That health pulse isn't a valid choice.");
    } else {
      pulse = pulseRaw;
    }
  }

  if (leaderNote !== null && leaderNote.length > LEADER_NOTE_MAX) {
    errors.push(`The leader note is too long (max ${LEADER_NOTE_MAX} characters).`);
  }

  const attendance = readAttendance(input.attendance);
  errors.push(...attendance.errors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      group_id: normalizeUuid(groupId as string),
      meeting_week: meetingWeek as string,
      meeting_date: meetingDate,
      status: status as LeaderSessionStatus,
      leader_note: leaderNote,
      pulse,
      follow_up_needed: followUp,
      attendance: status === "submitted" ? attendance.entries : [],
    },
  };
}

// Single-tenant church deployment: the entire app uses one wall-clock
// timezone for "today" and "this week" computations. Without this, a UTC
// `new Date()` rolls over to Monday during a Sunday-evening Central
// submission and the leader's check-in lands in the wrong ISO week
// (the dashboard would then show "this week" as not submitted even
// though the leader just submitted). Fox Valley Church is in Wisconsin
// (US Central), so we anchor on America/Chicago, which handles CST/CDT
// transitions automatically.
//
// If the app ever goes multi-tenant, this becomes per-org configuration.
export const CHURCH_TIMEZONE = "America/Chicago";

// `Intl.DateTimeFormat` with `en-CA` locale returns ISO `YYYY-MM-DD` form,
// and respects the timeZone option exactly. Using "en-CA" instead of "en-US"
// avoids the `MM/DD/YYYY` formatting and gives us a stable parse-target.
const LOCAL_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHURCH_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function localTodayIso(now: Date = new Date()): string {
  return LOCAL_DATE_FMT.format(now);
}

// Returns the Monday-of-ISO-week as YYYY-MM-DD for the given input.
//
// When passed a Date, the date is first projected into CHURCH_TIMEZONE so
// the day-of-week reflects the church's local calendar. When passed a
// YYYY-MM-DD string, the string is treated as a pure calendar date (no
// timezone) and the Monday-offset math runs directly on it -- this is
// what we want when a leader picks a meeting_date in the form.
export function isoWeekStart(date: Date | string): string {
  const dateIso =
    typeof date === "string" ? date.slice(0, 10) : localTodayIso(date);
  // Anchoring on UTC midnight here is safe: dateIso is already a fixed
  // calendar date, and getUTCDay returns the same weekday regardless of
  // the runtime's local timezone.
  const anchor = new Date(`${dateIso}T00:00:00Z`);
  const dayOfWeek = anchor.getUTCDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - mondayOffset);
  return anchor.toISOString().slice(0, 10);
}
