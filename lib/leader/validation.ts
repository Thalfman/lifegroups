// Phase 5B.0 validation contracts for the leader weekly check-in. Pure
// TypeScript, no I/O. Used by the server action before it hits the RPC
// boundary. The RPC re-validates everything at the database layer.

// The UUID trust-boundary regex has one canonical home (lib/shared/uuid),
// shared with the admin validators and the RPC result readers, so a
// case/format change lands in exactly one place.
import { isUuid } from "@/lib/shared/uuid";
// Cross-surface primitives (lib/shared/validation-primitives) — shared with
// the admin validator clusters so the record/uuid trust checks have one home.
import {
  isRecord,
  normalizeUuid,
  type ValidationResult,
} from "@/lib/shared/validation-primitives";

export type { ValidationResult };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SESSION_STATUSES = [
  "submitted",
  "did_not_meet",
  "planned_pause",
] as const;
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

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  // Reject obviously-bogus calendar values like 2026-13-40.
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
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
  return (
    typeof value === "string" &&
    (SESSION_STATUSES as readonly string[]).includes(value)
  );
}

function isPulse(value: unknown): value is LeaderPulseValue {
  return (
    typeof value === "string" &&
    (PULSE_VALUES as readonly string[]).includes(value)
  );
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
      if (existing >= 0)
        entries[existing] = {
          member_id: normalized,
          attendance_status: status,
        };
      continue;
    }
    seen.add(normalized);
    entries.push({ member_id: normalized, attendance_status: status });
  }

  return { entries, errors };
}

export function validateLeaderCheckinPayload(
  input: unknown
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
  if (
    meetingDateRaw !== undefined &&
    meetingDateRaw !== null &&
    meetingDateRaw !== ""
  ) {
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
    errors.push(
      `The leader note is too long (max ${LEADER_NOTE_MAX} characters).`
    );
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
