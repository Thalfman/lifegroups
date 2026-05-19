// Phase 5A.6 shared validation for group calendar event payloads.
//
// Used by both admin and leader server actions so the two paths share
// one source of truth for input shape, coercion rules, and friendly
// labels. Mirrors the ValidationResult contract in lib/admin/validation.ts
// and lib/leader/validation.ts.

import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
} from "@/types/enums";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Calendar dates are bounded to a reasonable planning horizon: 1 year
// in the past, 2 years in the future. This prevents typo dates
// (2999-01-01) and pairs with the read-window widths chosen on
// /leader/[groupId]/calendar (+52 weeks future) and
// /admin/groups/[groupId]/calendar (+52 weeks future) so newly
// created events stay visible from the calendar surface that created
// them.
const PAST_BOUND_DAYS = 365;
const FUTURE_BOUND_DAYS = 365 * 2;

const EVENT_TYPES: ReadonlySet<GroupCalendarEventType> = new Set([
  "study",
  "community_night",
  "mens_transformation",
  "womens_transformation",
  "social",
  "service",
  "prayer",
  "off",
  "cancelled",
  "other",
]);

const EVENT_STATUSES: ReadonlySet<GroupCalendarEventStatus> = new Set([
  "scheduled",
  "off",
  "cancelled",
]);

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function readOptionalString(value: unknown): string | undefined {
  const trimmed = trimString(value);
  if (trimmed === null || trimmed.length === 0) return undefined;
  return trimmed;
}

function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

function isWithinPlanningHorizon(value: string, now: Date): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const minDate = new Date(today);
  minDate.setUTCDate(minDate.getUTCDate() - PAST_BOUND_DAYS);
  const maxDate = new Date(today);
  maxDate.setUTCDate(maxDate.getUTCDate() + FUTURE_BOUND_DAYS);
  return parsed >= minDate && parsed <= maxDate;
}

function isHhMm(value: string): boolean {
  return HH_MM_RE.test(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isEventType(value: unknown): value is GroupCalendarEventType {
  return typeof value === "string" && EVENT_TYPES.has(value as GroupCalendarEventType);
}

function isEventStatus(value: unknown): value is GroupCalendarEventStatus {
  return typeof value === "string" && EVENT_STATUSES.has(value as GroupCalendarEventStatus);
}

export type CalendarEventWritablePayload = {
  event_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:mm
  end_time: string | null; // HH:mm
  event_type: GroupCalendarEventType;
  status: GroupCalendarEventStatus;
  title: string | null;
  description: string | null;
};

export type CalendarEventCreatePayload = CalendarEventWritablePayload & {
  group_id: string;
};

export type CalendarEventUpdatePayload = CalendarEventWritablePayload & {
  event_id: string;
};

export type CalendarEventArchivePayload = {
  event_id: string;
};

export type CalendarEventGroupIdPayload = {
  group_id: string;
};

// Coerce status / event_type for off and cancelled so the form is
// forgiving: picking "OFF" auto-forces event_type='off' even if the
// hidden event_type field still says 'study'. The CHECK constraint and
// the RPC enforce the same invariant.
function coerceEventType(
  status: GroupCalendarEventStatus,
  eventType: GroupCalendarEventType,
): GroupCalendarEventType {
  if (status === "off") return "off";
  if (status === "cancelled") return "cancelled";
  // scheduled: reject the two non-scheduled types
  if (eventType === "off" || eventType === "cancelled") return "study";
  return eventType;
}

function validateWritable(
  input: Record<string, unknown>,
): ValidationResult<CalendarEventWritablePayload> {
  const errors: string[] = [];

  const eventDate = trimString(input.event_date) ?? "";
  if (eventDate.length === 0) {
    errors.push("event_date is required (YYYY-MM-DD).");
  } else if (!isIsoDate(eventDate)) {
    errors.push("event_date must be a real ISO date in YYYY-MM-DD form.");
  } else if (!isWithinPlanningHorizon(eventDate, new Date())) {
    errors.push(
      "event_date must be within the planning horizon: 1 year in the past or 2 years in the future.",
    );
  }

  const startRaw = readOptionalString(input.start_time);
  const endRaw = readOptionalString(input.end_time);
  if (startRaw !== undefined && !isHhMm(startRaw)) {
    errors.push("start_time must be in HH:mm form (24-hour).");
  }
  if (endRaw !== undefined && !isHhMm(endRaw)) {
    errors.push("end_time must be in HH:mm form (24-hour).");
  }
  if (
    startRaw !== undefined &&
    endRaw !== undefined &&
    isHhMm(startRaw) &&
    isHhMm(endRaw) &&
    endRaw <= startRaw
  ) {
    errors.push("end_time must be later than start_time.");
  }

  const rawStatus = trimString(input.status) ?? "";
  if (rawStatus.length === 0) {
    errors.push("status is required.");
  } else if (!isEventStatus(rawStatus)) {
    errors.push("status must be scheduled, off, or cancelled.");
  }

  const rawType = trimString(input.event_type) ?? "";
  if (rawType.length === 0) {
    errors.push("event_type is required.");
  } else if (!isEventType(rawType)) {
    errors.push("event_type isn't one of the allowed values.");
  }

  const title = readOptionalString(input.title);
  if (title !== undefined && title.length > TITLE_MAX) {
    errors.push(`title can be at most ${TITLE_MAX} characters.`);
  }

  const description = readOptionalString(input.description);
  if (description !== undefined && description.length > DESCRIPTION_MAX) {
    errors.push(`description can be at most ${DESCRIPTION_MAX} characters.`);
  }

  if (errors.length > 0) return { ok: false, errors };

  const status = rawStatus as GroupCalendarEventStatus;
  const event_type = coerceEventType(status, rawType as GroupCalendarEventType);

  return {
    ok: true,
    value: {
      event_date: eventDate,
      start_time: startRaw ?? null,
      end_time: endRaw ?? null,
      event_type,
      status,
      title: title ?? null,
      description: description ?? null,
    },
  };
}

export function validateCalendarEventCreatePayload(
  input: unknown,
): ValidationResult<CalendarEventCreatePayload> {
  if (!isRecord(input)) {
    return { ok: false, errors: ["payload must be an object."] };
  }
  const groupId = trimString(input.group_id) ?? "";
  if (!isUuid(groupId)) {
    return { ok: false, errors: ["group_id must be a valid UUID."] };
  }
  const v = validateWritable(input);
  if (!v.ok) return v;
  return { ok: true, value: { ...v.value, group_id: groupId.toLowerCase() } };
}

export function validateCalendarEventUpdatePayload(
  input: unknown,
): ValidationResult<CalendarEventUpdatePayload> {
  if (!isRecord(input)) {
    return { ok: false, errors: ["payload must be an object."] };
  }
  const eventId = trimString(input.event_id) ?? "";
  if (!isUuid(eventId)) {
    return { ok: false, errors: ["event_id must be a valid UUID."] };
  }
  const v = validateWritable(input);
  if (!v.ok) return v;
  return { ok: true, value: { ...v.value, event_id: eventId.toLowerCase() } };
}

export function validateCalendarEventIdPayload(
  input: unknown,
): ValidationResult<CalendarEventArchivePayload> {
  if (!isRecord(input)) {
    return { ok: false, errors: ["payload must be an object."] };
  }
  const eventId = trimString(input.event_id) ?? "";
  if (!isUuid(eventId)) {
    return { ok: false, errors: ["event_id must be a valid UUID."] };
  }
  return { ok: true, value: { event_id: eventId.toLowerCase() } };
}

// ---------------------------------------------------------------------------
// Friendly labels.
// ---------------------------------------------------------------------------

const EVENT_TYPE_LABELS: Record<GroupCalendarEventType, string> = {
  study: "Study",
  community_night: "Community Night",
  mens_transformation: "Men’s Transformation",
  womens_transformation: "Women’s Transformation",
  social: "Social",
  service: "Service",
  prayer: "Prayer",
  off: "OFF",
  cancelled: "Cancelled",
  other: "Other",
};

const EVENT_STATUS_LABELS: Record<GroupCalendarEventStatus, string> = {
  scheduled: "Scheduled",
  off: "OFF",
  cancelled: "Cancelled",
};

export function friendlyEventTypeLabel(type: GroupCalendarEventType): string {
  return EVENT_TYPE_LABELS[type] ?? "Other";
}

export function friendlyEventStatusLabel(status: GroupCalendarEventStatus): string {
  return EVENT_STATUS_LABELS[status] ?? "Scheduled";
}

// Title fallback for UI: use the title if provided, else the friendly
// event_type label. Keeps the DB column nullable but never renders a
// blank label.
export function eventDisplayLabel(event: {
  title: string | null;
  event_type: GroupCalendarEventType;
}): string {
  const trimmed = event.title?.trim() ?? "";
  if (trimmed.length > 0) return trimmed;
  return friendlyEventTypeLabel(event.event_type);
}

// All event type options ordered for the create / edit form select.
export const EVENT_TYPE_OPTIONS: { value: GroupCalendarEventType; label: string }[] = [
  { value: "study", label: EVENT_TYPE_LABELS.study },
  { value: "community_night", label: EVENT_TYPE_LABELS.community_night },
  { value: "mens_transformation", label: EVENT_TYPE_LABELS.mens_transformation },
  { value: "womens_transformation", label: EVENT_TYPE_LABELS.womens_transformation },
  { value: "social", label: EVENT_TYPE_LABELS.social },
  { value: "service", label: EVENT_TYPE_LABELS.service },
  { value: "prayer", label: EVENT_TYPE_LABELS.prayer },
  { value: "other", label: EVENT_TYPE_LABELS.other },
];

export const EVENT_STATUS_OPTIONS: { value: GroupCalendarEventStatus; label: string }[] = [
  { value: "scheduled", label: EVENT_STATUS_LABELS.scheduled },
  { value: "off", label: EVENT_STATUS_LABELS.off },
  { value: "cancelled", label: EVENT_STATUS_LABELS.cancelled },
];
