import type {
  FollowUpPriority,
  FollowUpStatus,
  FollowUpType,
  GuestPipelineStage,
  MeetingFrequency,
  MeetingWeekParity,
  RoleInGroup,
  ShepherdCareInteractionType,
  ShepherdCareStatus,
  UserRole,
} from "@/types/enums";
import { isUuid } from "@/lib/shared/uuid";
import { isUserRole } from "@/lib/auth/roles";

// Phase 5A.0 validation contracts: pure TypeScript, no I/O, no Supabase. Reused by Phase 5A.1 server actions when writes are enabled.

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// At least one digit; allow common phone punctuation; 7–20 chars total.
const PHONE_RE = /^(?=[^\d]*\d)[+0-9().\- ]{7,20}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

// Forms post empty optional inputs as "". Treat empty / whitespace-only as absent.
function readOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = trimString(value);
  if (trimmed === null) return undefined;
  return trimmed.length === 0 ? undefined : trimmed;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

function isPhone(value: string): boolean {
  return PHONE_RE.test(value);
}

// Postgres stores UUIDs lowercase; canonicalize before any equality check
// so case-only variants of an actor's own id cannot bypass self-target guards.
function normalizeUuid(value: string): string {
  return value.toLowerCase();
}

export type CreateMinistryAdminPayload = {
  full_name: string;
  email: string;
};

export function validateCreateMinistryAdminPayload(
  input: unknown,
): ValidationResult<CreateMinistryAdminPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  const fullName = trimString(input.full_name) ?? "";
  const email = trimString(input.email) ?? "";
  if (fullName.length === 0) errors.push("full_name is required");
  if (!isEmail(email)) errors.push("email must be a valid address");
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { full_name: fullName, email } };
}

export type CreateLeaderProfilePayload = {
  full_name: string;
  email: string;
  phone?: string;
};

export function validateCreateLeaderProfilePayload(
  input: unknown,
): ValidationResult<CreateLeaderProfilePayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  const fullName = trimString(input.full_name) ?? "";
  const email = trimString(input.email) ?? "";
  const phone = readOptionalString(input.phone);
  if (fullName.length === 0) errors.push("full_name is required");
  if (!isEmail(email)) errors.push("email must be a valid address");
  if (phone !== undefined && !isPhone(phone)) errors.push("phone format is invalid");
  if (errors.length > 0) return { ok: false, errors };
  const value: CreateLeaderProfilePayload = { full_name: fullName, email };
  if (phone !== undefined) value.phone = phone;
  return { ok: true, value };
}

export type CreateMemberPayload = {
  full_name: string;
  email?: string;
  phone?: string;
};

export function validateCreateMemberPayload(
  input: unknown,
): ValidationResult<CreateMemberPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  const fullName = trimString(input.full_name) ?? "";
  const email = readOptionalString(input.email);
  const phone = readOptionalString(input.phone);
  if (fullName.length === 0) errors.push("full_name is required");
  if (email !== undefined && !isEmail(email)) errors.push("email must be a valid address");
  if (phone !== undefined && !isPhone(phone)) errors.push("phone format is invalid");
  if (errors.length > 0) return { ok: false, errors };
  const value: CreateMemberPayload = { full_name: fullName };
  if (email !== undefined) value.email = email;
  if (phone !== undefined) value.phone = phone;
  return { ok: true, value };
}

export type AssignLeaderToGroupPayload = {
  group_id: string;
  profile_id: string;
  role: Extract<RoleInGroup, "leader" | "co_leader">;
};

export function validateAssignLeaderToGroupPayload(
  input: unknown,
): ValidationResult<AssignLeaderToGroupPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.group_id)) errors.push("group_id must be a uuid");
  if (!isUuid(input.profile_id)) errors.push("profile_id must be a uuid");
  if (input.role !== "leader" && input.role !== "co_leader") {
    errors.push("role must be 'leader' or 'co_leader'");
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      group_id: normalizeUuid(input.group_id as string),
      profile_id: normalizeUuid(input.profile_id as string),
      role: input.role as "leader" | "co_leader",
    },
  };
}

// Phase 5A.1 forces role='member' server-side; leader/co_leader assignments
// flow through group_leaders + adminAssignLeaderToGroup instead, so the
// payload no longer accepts a client-side role choice.
export type AssignMemberToGroupPayload = {
  group_id: string;
  member_id: string;
};

export function validateAssignMemberToGroupPayload(
  input: unknown,
): ValidationResult<AssignMemberToGroupPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.group_id)) errors.push("group_id must be a uuid");
  if (!isUuid(input.member_id)) errors.push("member_id must be a uuid");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      group_id: normalizeUuid(input.group_id as string),
      member_id: normalizeUuid(input.member_id as string),
    },
  };
}

export type DeactivateProfilePayload = { profile_id: string };

export function validateDeactivateProfilePayload(
  input: unknown,
): ValidationResult<DeactivateProfilePayload> {
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.profile_id)) return { ok: false, errors: ["profile_id must be a uuid"] };
  return { ok: true, value: { profile_id: normalizeUuid(input.profile_id as string) } };
}

export type DeactivateMemberPayload = { member_id: string };

export function validateDeactivateMemberPayload(
  input: unknown,
): ValidationResult<DeactivateMemberPayload> {
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.member_id)) return { ok: false, errors: ["member_id must be a uuid"] };
  return { ok: true, value: { member_id: normalizeUuid(input.member_id as string) } };
}

export type ChangeUserRolePayload = {
  profile_id: string;
  new_role: UserRole;
};

export function validateChangeUserRolePayload(
  input: unknown,
): ValidationResult<ChangeUserRolePayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.profile_id)) errors.push("profile_id must be a uuid");
  if (!isUserRole(input.new_role)) errors.push("new_role must be a valid user_role");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      profile_id: normalizeUuid(input.profile_id as string),
      new_role: input.new_role as UserRole,
    },
  };
}

// Self-escalation protections. Pure functions to be called by future
// Phase 5A.1 server actions before any write. Returns an error string
// when the guard rejects, otherwise null. Each guard canonicalizes ids
// to lowercase so case-only variants of an actor's own id cannot bypass.

export function guardAgainstSelfTarget(
  actorProfileId: string,
  targetProfileId: string,
): string | null {
  if (normalizeUuid(actorProfileId) === normalizeUuid(targetProfileId)) {
    return "Admins cannot perform this action against their own profile.";
  }
  return null;
}

export function guardAgainstSelfRoleChange(
  actor: { id: string; role: UserRole },
  payload: ChangeUserRolePayload,
): string | null {
  if (normalizeUuid(actor.id) === normalizeUuid(payload.profile_id)) {
    return "Admins cannot change their own role.";
  }
  return null;
}

export function guardAgainstSuperAdminAssignment(
  payload: ChangeUserRolePayload,
): string | null {
  if (payload.new_role === "super_admin") {
    return "super_admin cannot be assigned through the app. Use the documented bootstrap procedure.";
  }
  return null;
}

// staff_viewer is retained in the SQL enum and TS union for backwards
// compatibility but is no longer a promoted product workflow. The
// Phase 5A.3 role-change form omits it from the role select, and this
// guard provides defense-in-depth for direct callers.
export function guardAgainstStaffViewerAssignment(
  payload: ChangeUserRolePayload,
): string | null {
  if (payload.new_role === "staff_viewer") {
    return "staff_viewer is deprecated and can't be assigned from the app.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Phase 5A.2 — Group management payloads
// ---------------------------------------------------------------------------

// Accepts HH:mm or HH:mm:ss (24-hour). The server-side RPC takes a `time`
// value; we keep the string contract here so server actions never have to
// hand-parse timezone-aware strings.
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function isTimeString(value: string): boolean {
  return TIME_RE.test(value);
}

function readOptionalCapacity(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    // Reject NaN / Infinity / fractional values so programmatic callers
    // see the same "Capacity must be a whole number." failure that string
    // callers get when they submit "12.7".
    if (!Number.isFinite(value)) return Number.NaN;
    if (!Number.isInteger(value)) return Number.NaN;
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    if (!/^\d+$/.test(trimmed)) return Number.NaN;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}

// Phase 5A.5 canonical meeting schedule vocabularies. Stored verbatim in
// `public.groups.meeting_day` (Capitalized day name) and as Postgres enum
// values for frequency / parity. The DB also enforces these via CHECK +
// enum constraints; the TS validation layer surfaces friendlier errors.
export const MEETING_DAYS: ReadonlySet<string> = new Set([
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]);

const MEETING_FREQUENCIES: ReadonlySet<MeetingFrequency> = new Set([
  "weekly",
  "biweekly",
  "monthly",
]);

const MEETING_WEEK_PARITIES: ReadonlySet<MeetingWeekParity> = new Set([
  "odd",
  "even",
]);

function isMeetingFrequency(value: unknown): value is MeetingFrequency {
  return typeof value === "string" && MEETING_FREQUENCIES.has(value as MeetingFrequency);
}

function isMeetingWeekParity(value: unknown): value is MeetingWeekParity {
  return typeof value === "string" && MEETING_WEEK_PARITIES.has(value as MeetingWeekParity);
}

export type GroupWritablePayload = {
  name: string;
  description?: string;
  meeting_day?: string;
  meeting_time?: string;
  meeting_frequency: MeetingFrequency;
  meeting_week_parity: MeetingWeekParity | null;
  location_area?: string;
  address_optional?: string;
  capacity?: number;
};

function validateGroupWritablePayload(
  input: unknown,
): ValidationResult<GroupWritablePayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };

  const name = trimString(input.name) ?? "";
  const description = readOptionalString(input.description);
  const meetingDay = readOptionalString(input.meeting_day);
  const meetingTime = readOptionalString(input.meeting_time);
  const locationArea = readOptionalString(input.location_area);
  const addressOptional = readOptionalString(input.address_optional);
  const capacity = readOptionalCapacity(input.capacity);

  // Frequency defaults to 'weekly' when missing so the minimal-data "create
  // a group with just a name" path keeps working. An explicit but invalid
  // value still errors so a typo doesn't silently fall back.
  const rawFrequency = readOptionalString(input.meeting_frequency);
  let frequency: MeetingFrequency = "weekly";
  if (rawFrequency !== undefined) {
    if (!isMeetingFrequency(rawFrequency)) {
      errors.push("Meeting frequency must be weekly, biweekly, or monthly.");
    } else {
      frequency = rawFrequency;
    }
  }

  const rawParity = readOptionalString(input.meeting_week_parity);
  let parity: MeetingWeekParity | null = null;
  if (rawParity !== undefined) {
    if (!isMeetingWeekParity(rawParity)) {
      errors.push("Bi-weekly parity must be odd or even.");
    } else {
      parity = rawParity;
    }
  }
  // Parity is only meaningful for bi-weekly groups. Weekly/monthly groups
  // always submit null so a stale form value can't leak through.
  if (frequency !== "biweekly") {
    parity = null;
  }

  if (name.length === 0) errors.push("Group name is required.");
  if (name.length > 120) errors.push("Group name is too long (max 120 characters).");
  if (description !== undefined && description.length > 500)
    errors.push("Description is too long (max 500 characters).");
  if (meetingDay !== undefined && !MEETING_DAYS.has(meetingDay))
    errors.push("Meeting day must be Sunday through Saturday.");
  if (meetingTime !== undefined && !isTimeString(meetingTime))
    errors.push("Meeting time must look like 18:30.");
  if (locationArea !== undefined && locationArea.length > 80)
    errors.push("Location area is too long.");
  if (addressOptional !== undefined && addressOptional.length > 200)
    errors.push("Address is too long.");
  if (capacity !== undefined) {
    if (Number.isNaN(capacity)) errors.push("Capacity must be a whole number.");
    else if (capacity < 0) errors.push("Capacity can't be negative.");
    else if (capacity > 1000) errors.push("Capacity is unusually large (max 1000).");
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: GroupWritablePayload = {
    name,
    meeting_frequency: frequency,
    meeting_week_parity: parity,
  };
  if (description !== undefined) value.description = description;
  if (meetingDay !== undefined) value.meeting_day = meetingDay;
  if (meetingTime !== undefined) value.meeting_time = meetingTime;
  if (locationArea !== undefined) value.location_area = locationArea;
  if (addressOptional !== undefined) value.address_optional = addressOptional;
  if (capacity !== undefined) value.capacity = capacity;
  return { ok: true, value };
}

export type CreateGroupPayload = GroupWritablePayload;

export function validateCreateGroupPayload(
  input: unknown,
): ValidationResult<CreateGroupPayload> {
  return validateGroupWritablePayload(input);
}

export type UpdateGroupPayload = GroupWritablePayload & { group_id: string };

export function validateUpdateGroupPayload(
  input: unknown,
): ValidationResult<UpdateGroupPayload> {
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.group_id)) return { ok: false, errors: ["group_id must be a uuid"] };
  const inner = validateGroupWritablePayload(input);
  if (!inner.ok) return inner;
  return {
    ok: true,
    value: { ...inner.value, group_id: normalizeUuid(input.group_id as string) },
  };
}

export type GroupIdPayload = { group_id: string };

export function validateGroupIdPayload(
  input: unknown,
): ValidationResult<GroupIdPayload> {
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.group_id)) return { ok: false, errors: ["group_id must be a uuid"] };
  return { ok: true, value: { group_id: normalizeUuid(input.group_id as string) } };
}

// ---------------------------------------------------------------------------
// Phase 5A.4 — Metric settings + leader role swap payloads
// ---------------------------------------------------------------------------

const GROUP_HEALTH_STATUSES = new Set([
  "healthy",
  "watch",
  "needs_follow_up",
  "healthy_paused",
  "restart_soon",
  "overdue_restart",
  "capacity_full",
  "needs_leader_support",
]);

function isGroupHealthStatus(value: unknown): value is string {
  return typeof value === "string" && GROUP_HEALTH_STATUSES.has(value);
}

function readOptionalInteger(value: unknown): number | undefined | "invalid" {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return "invalid";
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    if (!/^-?\d+$/.test(trimmed)) return "invalid";
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : "invalid";
  }
  return "invalid";
}

function readOptionalBoolean(value: unknown): boolean | undefined | "invalid" {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "") return undefined;
    if (trimmed === "true" || trimmed === "on" || trimmed === "1") return true;
    if (trimmed === "false" || trimmed === "off" || trimmed === "0") return false;
    return "invalid";
  }
  return "invalid";
}

// Each key is optional in the submitted payload. The RPC merges the
// submitted subset onto the stored row, so omitting a key leaves the
// existing default in place. The bounds here mirror the RPC body so
// the validation reject path uses friendlier messages while the RPC
// stays the security boundary.
export type MetricDefaultsPayload = {
  default_group_capacity?: number | null;
  capacity_warning_threshold_pct?: number;
  capacity_full_threshold_pct?: number;
  check_in_due_day_of_week?: number;
  missed_checkin_warning_weeks?: number;
  default_healthy_attendance_pct?: number;
  check_in_due_offset_hours?: number;
};

const METRIC_DEFAULT_KEYS: ReadonlySet<string> = new Set([
  "default_group_capacity",
  "capacity_warning_threshold_pct",
  "capacity_full_threshold_pct",
  "check_in_due_day_of_week",
  "missed_checkin_warning_weeks",
  "default_healthy_attendance_pct",
  "check_in_due_offset_hours",
]);

export function validateMetricDefaultsPayload(
  input: unknown,
): ValidationResult<MetricDefaultsPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };

  // Reject keys outside the whitelist so the UI surfaces typos.
  for (const key of Object.keys(input)) {
    if (!METRIC_DEFAULT_KEYS.has(key)) {
      errors.push(`Unknown setting key: ${key}`);
    }
  }

  const value: MetricDefaultsPayload = {};

  if ("default_group_capacity" in input) {
    const raw = input.default_group_capacity;
    if (raw === null || raw === "" || raw === undefined) {
      // Allow explicit clearing back to Unknown by sending null.
      // The form posts "" for an empty number input; treat both as null.
      value.default_group_capacity = null;
    } else {
      const n = readOptionalInteger(raw);
      if (n === "invalid") errors.push("Default capacity must be a whole number.");
      else if (n !== undefined && (n < 1 || n > 500))
        errors.push("Default capacity must be between 1 and 500.");
      else if (n !== undefined) value.default_group_capacity = n;
    }
  }

  if ("capacity_warning_threshold_pct" in input) {
    const n = readOptionalInteger(input.capacity_warning_threshold_pct);
    if (n === "invalid") errors.push("Capacity warning % must be a whole number.");
    else if (n !== undefined && (n < 0 || n > 300))
      errors.push("Capacity warning % must be between 0 and 300.");
    else if (n !== undefined) value.capacity_warning_threshold_pct = n;
  }

  if ("capacity_full_threshold_pct" in input) {
    const n = readOptionalInteger(input.capacity_full_threshold_pct);
    if (n === "invalid") errors.push("Capacity full % must be a whole number.");
    else if (n !== undefined && (n < 1 || n > 300))
      errors.push("Capacity full % must be between 1 and 300.");
    else if (n !== undefined) value.capacity_full_threshold_pct = n;
  }

  if ("check_in_due_day_of_week" in input) {
    const n = readOptionalInteger(input.check_in_due_day_of_week);
    if (n === "invalid") errors.push("Check-in due day must be a whole number 0-6.");
    else if (n !== undefined && (n < 0 || n > 6))
      errors.push("Check-in due day must be 0 (Sunday) through 6 (Saturday).");
    else if (n !== undefined) value.check_in_due_day_of_week = n;
  }

  if ("missed_checkin_warning_weeks" in input) {
    const n = readOptionalInteger(input.missed_checkin_warning_weeks);
    if (n === "invalid") errors.push("Missed check-in warning weeks must be a whole number.");
    else if (n !== undefined && (n < 1 || n > 12))
      errors.push("Missed check-in warning weeks must be between 1 and 12.");
    else if (n !== undefined) value.missed_checkin_warning_weeks = n;
  }

  if ("default_healthy_attendance_pct" in input) {
    const n = readOptionalInteger(input.default_healthy_attendance_pct);
    if (n === "invalid") errors.push("Healthy attendance % must be a whole number.");
    else if (n !== undefined && (n < 0 || n > 100))
      errors.push("Healthy attendance % must be between 0 and 100.");
    else if (n !== undefined) value.default_healthy_attendance_pct = n;
  }

  if ("check_in_due_offset_hours" in input) {
    const n = readOptionalInteger(input.check_in_due_offset_hours);
    if (n === "invalid")
      errors.push("Check-in due offset hours must be a whole number.");
    else if (n !== undefined && (n < 0 || n > 336))
      errors.push("Check-in due offset hours must be between 0 and 336 (14 days).");
    else if (n !== undefined) value.check_in_due_offset_hours = n;
  }

  // Cross-field: full % must be >= warning % when both present (or fall
  // back to the documented defaults so a one-sided submit can still be
  // validated sanely).
  const stagedFull =
    value.capacity_full_threshold_pct !== undefined
      ? value.capacity_full_threshold_pct
      : undefined;
  const stagedWarning =
    value.capacity_warning_threshold_pct !== undefined
      ? value.capacity_warning_threshold_pct
      : undefined;
  if (stagedFull !== undefined && stagedWarning !== undefined && stagedFull < stagedWarning) {
    errors.push("Capacity full % must be greater than or equal to capacity warning %.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

export type GroupMetricSettingsPayload = {
  group_id: string;
  capacity_override: number | null;
  capacity_warning_threshold_pct_override: number | null;
  healthy_attendance_pct_override: number | null;
  manual_health_status_override: string | null;
  exclude_from_capacity_metrics: boolean;
  admin_metric_notes: string | null;
  check_in_due_offset_hours_override: number | null;
};

export function validateGroupMetricSettingsPayload(
  input: unknown,
): ValidationResult<GroupMetricSettingsPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.group_id)) errors.push("group_id must be a uuid");

  let capacityOverride: number | null = null;
  {
    const raw = input.capacity_override;
    if (raw === undefined || raw === null || raw === "") {
      capacityOverride = null;
    } else {
      const n = readOptionalInteger(raw);
      if (n === "invalid") errors.push("Capacity override must be a whole number.");
      else if (n === undefined) capacityOverride = null;
      else if (n < 1 || n > 500)
        errors.push("Capacity override must be between 1 and 500.");
      else capacityOverride = n;
    }
  }

  let warningOverride: number | null = null;
  {
    const raw = input.capacity_warning_threshold_pct_override;
    if (raw === undefined || raw === null || raw === "") {
      warningOverride = null;
    } else {
      const n = readOptionalInteger(raw);
      if (n === "invalid")
        errors.push("Capacity warning % override must be a whole number.");
      else if (n === undefined) warningOverride = null;
      else if (n < 0 || n > 300)
        errors.push("Capacity warning % override must be between 0 and 300.");
      else warningOverride = n;
    }
  }

  let healthyOverride: number | null = null;
  {
    const raw = input.healthy_attendance_pct_override;
    if (raw === undefined || raw === null || raw === "") {
      healthyOverride = null;
    } else {
      const n = readOptionalInteger(raw);
      if (n === "invalid")
        errors.push("Healthy attendance % override must be a whole number.");
      else if (n === undefined) healthyOverride = null;
      else if (n < 0 || n > 100)
        errors.push("Healthy attendance % override must be between 0 and 100.");
      else healthyOverride = n;
    }
  }

  let checkInOffsetOverride: number | null = null;
  {
    const raw = input.check_in_due_offset_hours_override;
    if (raw === undefined || raw === null || raw === "") {
      checkInOffsetOverride = null;
    } else {
      const n = readOptionalInteger(raw);
      if (n === "invalid")
        errors.push("Check-in due offset override must be a whole number.");
      else if (n === undefined) checkInOffsetOverride = null;
      else if (n < 0 || n > 336)
        errors.push(
          "Check-in due offset override must be between 0 and 336 (14 days).",
        );
      else checkInOffsetOverride = n;
    }
  }

  let manualHealth: string | null = null;
  {
    const raw = input.manual_health_status_override;
    if (raw === undefined || raw === null || raw === "" || raw === "none") {
      manualHealth = null;
    } else if (isGroupHealthStatus(raw)) {
      manualHealth = raw;
    } else {
      errors.push("Manual health status override is not a valid value.");
    }
  }

  let excludeFromCapacity = false;
  {
    const raw = readOptionalBoolean(input.exclude_from_capacity_metrics);
    if (raw === "invalid") errors.push("Exclude from capacity must be true or false.");
    else if (raw !== undefined) excludeFromCapacity = raw;
  }

  let notes: string | null = null;
  {
    const raw = readOptionalString(input.admin_metric_notes);
    if (raw === undefined) notes = null;
    else if (raw.length > 1000) errors.push("Notes are too long (max 1000 characters).");
    else notes = raw;
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      group_id: normalizeUuid(input.group_id as string),
      capacity_override: capacityOverride,
      capacity_warning_threshold_pct_override: warningOverride,
      healthy_attendance_pct_override: healthyOverride,
      manual_health_status_override: manualHealth,
      exclude_from_capacity_metrics: excludeFromCapacity,
      admin_metric_notes: notes,
      check_in_due_offset_hours_override: checkInOffsetOverride,
    },
  };
}

export type ChangeLeaderRolePayload = {
  profile_id: string;
  new_role: "leader" | "co_leader";
};

export function validateChangeLeaderRolePayload(
  input: unknown,
): ValidationResult<ChangeLeaderRolePayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.profile_id)) errors.push("profile_id must be a uuid");
  if (input.new_role !== "leader" && input.new_role !== "co_leader") {
    errors.push("new_role must be 'leader' or 'co_leader'");
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      profile_id: normalizeUuid(input.profile_id as string),
      new_role: input.new_role as "leader" | "co_leader",
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 5C.0 — Guest pipeline + follow-up payloads.
// ---------------------------------------------------------------------------

const GUEST_PIPELINE_STAGES: ReadonlySet<GuestPipelineStage> = new Set([
  "new",
  "contacted",
  "interested",
  "assigned",
  "attended",
  "placed",
  "not_now",
]);

const FOLLOW_UP_TYPES: ReadonlySet<FollowUpType> = new Set([
  "attendance",
  "guest",
  "leader",
  "capacity",
  "pause",
  "care",
  "admin",
]);

const FOLLOW_UP_PRIORITIES: ReadonlySet<FollowUpPriority> = new Set([
  "low",
  "normal",
  "high",
]);

const FOLLOW_UP_STATUSES: ReadonlySet<FollowUpStatus> = new Set([
  "open",
  "in_progress",
  "done",
  "snoozed",
]);

const LEADER_FOLLOW_UP_STATUSES: ReadonlySet<FollowUpStatus> = new Set([
  "in_progress",
  "done",
]);

// ISO date `YYYY-MM-DD`. The RPC takes `date` so we trust the value if
// parseable; this just keeps obviously-malformed input out of the network.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value);
}

function isPipelineStage(value: unknown): value is GuestPipelineStage {
  return typeof value === "string" && GUEST_PIPELINE_STAGES.has(value as GuestPipelineStage);
}

function isFollowUpType(value: unknown): value is FollowUpType {
  return typeof value === "string" && FOLLOW_UP_TYPES.has(value as FollowUpType);
}

function isFollowUpPriority(value: unknown): value is FollowUpPriority {
  return typeof value === "string" && FOLLOW_UP_PRIORITIES.has(value as FollowUpPriority);
}

function isFollowUpStatus(value: unknown): value is FollowUpStatus {
  return typeof value === "string" && FOLLOW_UP_STATUSES.has(value as FollowUpStatus);
}

function isLeaderFollowUpStatus(value: unknown): value is FollowUpStatus {
  return typeof value === "string" && LEADER_FOLLOW_UP_STATUSES.has(value as FollowUpStatus);
}

// HTML forms post boolean fields as "true" / "false" / "on" / "1" / "0".
// `Boolean(value)` on a non-empty string is always true, so we need an
// explicit parser to keep "false" from accidentally meaning "true".
function readBooleanFlag(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value === undefined || value === null) return false;
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    return t === "true" || t === "on" || t === "1";
  }
  return false;
}

export type CreateGuestPayload = {
  full_name: string;
  email: string | null;
  phone: string | null;
  first_attended_group_id: string | null;
  first_attended_date: string | null;
  pipeline_stage: GuestPipelineStage;
  assigned_group_id: string | null;
  follow_up_owner_id: string | null;
  notes: string | null;
};

export function validateCreateGuestPayload(
  input: unknown,
): ValidationResult<CreateGuestPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  const fullName = trimString(input.full_name) ?? "";
  const email = readOptionalString(input.email);
  const phone = readOptionalString(input.phone);
  const firstAttendedGroupId = readOptionalString(input.first_attended_group_id);
  const firstAttendedDate = readOptionalString(input.first_attended_date);
  const assignedGroupId = readOptionalString(input.assigned_group_id);
  const followUpOwnerId = readOptionalString(input.follow_up_owner_id);
  const notes = readOptionalString(input.notes);
  const rawStage = readOptionalString(input.pipeline_stage);
  const stage: GuestPipelineStage = rawStage !== undefined
    ? (rawStage as GuestPipelineStage)
    : "new";

  if (fullName.length === 0) errors.push("Guest name is required.");
  if (fullName.length > 120) errors.push("Guest name is too long (max 120 characters).");
  if (email !== undefined && !isEmail(email)) errors.push("Email must be a valid address.");
  if (phone !== undefined && !isPhone(phone)) errors.push("Phone format is invalid.");
  if (firstAttendedGroupId !== undefined && !isUuid(firstAttendedGroupId)) {
    errors.push("First-attended group is invalid.");
  }
  if (assignedGroupId !== undefined && !isUuid(assignedGroupId)) {
    errors.push("Assigned group is invalid.");
  }
  if (followUpOwnerId !== undefined && !isUuid(followUpOwnerId)) {
    errors.push("Follow-up owner is invalid.");
  }
  if (firstAttendedDate !== undefined && !isIsoDate(firstAttendedDate)) {
    errors.push("First-attended date must be YYYY-MM-DD.");
  }
  if (rawStage !== undefined && !isPipelineStage(rawStage)) {
    errors.push("Pipeline stage isn't a valid value.");
  }
  if (notes !== undefined && notes.length > 1000) {
    errors.push("Notes are too long (max 1000 characters).");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      full_name: fullName,
      email: email ?? null,
      phone: phone ?? null,
      first_attended_group_id: firstAttendedGroupId
        ? normalizeUuid(firstAttendedGroupId)
        : null,
      first_attended_date: firstAttendedDate ?? null,
      pipeline_stage: stage,
      assigned_group_id: assignedGroupId ? normalizeUuid(assignedGroupId) : null,
      follow_up_owner_id: followUpOwnerId ? normalizeUuid(followUpOwnerId) : null,
      notes: notes ?? null,
    },
  };
}

export type UpdateGuestPipelinePayload = {
  guest_id: string;
  pipeline_stage: GuestPipelineStage;
  set_assigned_group_id: boolean;
  assigned_group_id: string | null;
  set_follow_up_owner_id: boolean;
  follow_up_owner_id: string | null;
  set_notes: boolean;
  notes: string | null;
};

export function validateUpdateGuestPipelinePayload(
  input: unknown,
): ValidationResult<UpdateGuestPipelinePayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.guest_id)) errors.push("guest_id must be a uuid");
  if (!isPipelineStage(input.pipeline_stage)) {
    errors.push("Pipeline stage isn't a valid value.");
  }

  const setAssigned = readBooleanFlag(input.set_assigned_group_id);
  const setOwner = readBooleanFlag(input.set_follow_up_owner_id);
  const setNotes = readBooleanFlag(input.set_notes);

  const assignedRaw = readOptionalString(input.assigned_group_id);
  const ownerRaw = readOptionalString(input.follow_up_owner_id);
  const notesRaw = readOptionalString(input.notes);

  if (setAssigned && assignedRaw !== undefined && !isUuid(assignedRaw)) {
    errors.push("Assigned group is invalid.");
  }
  if (setOwner && ownerRaw !== undefined && !isUuid(ownerRaw)) {
    errors.push("Follow-up owner is invalid.");
  }
  if (setNotes && notesRaw !== undefined && notesRaw.length > 1000) {
    errors.push("Notes are too long (max 1000 characters).");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      guest_id: normalizeUuid(input.guest_id as string),
      pipeline_stage: input.pipeline_stage as GuestPipelineStage,
      set_assigned_group_id: setAssigned,
      assigned_group_id: setAssigned && assignedRaw ? normalizeUuid(assignedRaw) : null,
      set_follow_up_owner_id: setOwner,
      follow_up_owner_id: setOwner && ownerRaw ? normalizeUuid(ownerRaw) : null,
      set_notes: setNotes,
      notes: setNotes ? notesRaw ?? null : null,
    },
  };
}

export type CreateFollowUpPayload = {
  type: FollowUpType;
  title: string;
  related_group_id: string | null;
  related_member_id: string | null;
  related_guest_id: string | null;
  assigned_to: string | null;
  priority: FollowUpPriority;
  due_date: string | null;
  leader_visible_note: string | null;
  admin_private_note: string | null;
};

export function validateCreateFollowUpPayload(
  input: unknown,
): ValidationResult<CreateFollowUpPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };

  const title = trimString(input.title) ?? "";
  if (title.length === 0) errors.push("Title is required.");
  if (title.length > 200) errors.push("Title is too long (max 200 characters).");

  if (!isFollowUpType(input.type)) errors.push("Type isn't a valid value.");
  const priority: FollowUpPriority = isFollowUpPriority(input.priority)
    ? (input.priority as FollowUpPriority)
    : "normal";

  const group = readOptionalString(input.related_group_id);
  const member = readOptionalString(input.related_member_id);
  const guest = readOptionalString(input.related_guest_id);
  const assignedTo = readOptionalString(input.assigned_to);
  const dueDate = readOptionalString(input.due_date);
  const leaderNote = readOptionalString(input.leader_visible_note);
  const adminNote = readOptionalString(input.admin_private_note);

  if (group !== undefined && !isUuid(group)) errors.push("Related group is invalid.");
  if (member !== undefined && !isUuid(member)) errors.push("Related member is invalid.");
  if (guest !== undefined && !isUuid(guest)) errors.push("Related guest is invalid.");
  if (assignedTo !== undefined && !isUuid(assignedTo))
    errors.push("Assigned-to is invalid.");
  if (dueDate !== undefined && !isIsoDate(dueDate))
    errors.push("Due date must be YYYY-MM-DD.");
  if (leaderNote !== undefined && leaderNote.length > 1000)
    errors.push("Leader-visible note is too long (max 1000 characters).");
  if (adminNote !== undefined && adminNote.length > 1000)
    errors.push("Admin-private note is too long (max 1000 characters).");

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      type: input.type as FollowUpType,
      title,
      related_group_id: group ? normalizeUuid(group) : null,
      related_member_id: member ? normalizeUuid(member) : null,
      related_guest_id: guest ? normalizeUuid(guest) : null,
      assigned_to: assignedTo ? normalizeUuid(assignedTo) : null,
      priority,
      due_date: dueDate ?? null,
      leader_visible_note: leaderNote ?? null,
      admin_private_note: adminNote ?? null,
    },
  };
}

export type AdminUpdateFollowUpStatusPayload = {
  follow_up_id: string;
  status: FollowUpStatus;
  set_leader_visible_note: boolean;
  leader_visible_note: string | null;
  set_admin_private_note: boolean;
  admin_private_note: string | null;
};

export function validateAdminUpdateFollowUpStatusPayload(
  input: unknown,
): ValidationResult<AdminUpdateFollowUpStatusPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.follow_up_id)) errors.push("follow_up_id must be a uuid");
  if (!isFollowUpStatus(input.status)) errors.push("Status isn't a valid value.");

  const setLeader = readBooleanFlag(input.set_leader_visible_note);
  const setAdmin = readBooleanFlag(input.set_admin_private_note);
  const leaderNote = readOptionalString(input.leader_visible_note);
  const adminNote = readOptionalString(input.admin_private_note);

  if (setLeader && leaderNote !== undefined && leaderNote.length > 1000)
    errors.push("Leader-visible note is too long (max 1000 characters).");
  if (setAdmin && adminNote !== undefined && adminNote.length > 1000)
    errors.push("Admin-private note is too long (max 1000 characters).");

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      follow_up_id: normalizeUuid(input.follow_up_id as string),
      status: input.status as FollowUpStatus,
      set_leader_visible_note: setLeader,
      leader_visible_note: setLeader ? leaderNote ?? null : null,
      set_admin_private_note: setAdmin,
      admin_private_note: setAdmin ? adminNote ?? null : null,
    },
  };
}

export type LeaderUpdateFollowUpStatusPayload = {
  follow_up_id: string;
  status: "in_progress" | "done";
};

export function validateLeaderUpdateFollowUpStatusPayload(
  input: unknown,
): ValidationResult<LeaderUpdateFollowUpStatusPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.follow_up_id)) errors.push("follow_up_id must be a uuid");
  if (!isLeaderFollowUpStatus(input.status))
    errors.push("Leaders can only mark follow-ups in progress or done.");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      follow_up_id: normalizeUuid(input.follow_up_id as string),
      status: input.status as "in_progress" | "done",
    },
  };
}

// Re-exported for tests and Phase 5A.1 callers that need canonical comparisons.
export { normalizeUuid };

// ---------------------------------------------------------------------------
// Phase 5A.7 — Super admin invite user payload.
// ---------------------------------------------------------------------------

// Roles the invite form is allowed to assign. super_admin is forbidden
// (bootstrap procedure only). staff_viewer is forbidden (legacy).
const INVITE_USER_ROLES: ReadonlySet<"ministry_admin" | "leader" | "co_leader"> = new Set([
  "ministry_admin",
  "leader",
  "co_leader",
]);

export type InviteUserPayload = {
  full_name: string;
  email: string; // canonicalized lowercase
  role: "ministry_admin" | "leader" | "co_leader";
  phone?: string;
  group_id?: string;
};

export function validateInviteUserPayload(
  input: unknown,
): ValidationResult<InviteUserPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };

  const fullName = trimString(input.full_name) ?? "";
  const emailRaw = trimString(input.email) ?? "";
  const email = emailRaw.toLowerCase();
  const phone = readOptionalString(input.phone);
  const groupIdRaw = readOptionalString(input.group_id);
  const role = typeof input.role === "string" ? input.role : "";

  if (fullName.length === 0) errors.push("Full name is required.");
  if (email.length === 0) errors.push("Email is required.");
  else if (!isEmail(email)) errors.push("Email must be a valid address.");
  if (!INVITE_USER_ROLES.has(role as InviteUserPayload["role"])) {
    errors.push("Role must be Ministry Admin, Leader, or Co-Leader.");
  }
  if (phone !== undefined && !isPhone(phone)) errors.push("Phone format is invalid.");
  if (groupIdRaw !== undefined && !isUuid(groupIdRaw)) errors.push("Group selection is invalid.");
  if (role === "ministry_admin" && groupIdRaw !== undefined) {
    errors.push("Ministry admins are not assigned to a group.");
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: InviteUserPayload = {
    full_name: fullName,
    email,
    role: role as InviteUserPayload["role"],
  };
  if (phone !== undefined) value.phone = phone;
  if (groupIdRaw !== undefined) value.group_id = normalizeUuid(groupIdRaw);
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Phase 5D.0 — Shepherd care tracker payloads.
// ---------------------------------------------------------------------------

const SHEPHERD_CARE_STATUSES: ReadonlySet<ShepherdCareStatus> = new Set([
  "healthy",
  "watch",
  "needs_attention",
]);

const SHEPHERD_CARE_INTERACTION_TYPES: ReadonlySet<ShepherdCareInteractionType> = new Set([
  "call",
  "text",
  "in_person",
  "meeting",
  "other",
]);

function isShepherdCareStatus(value: unknown): value is ShepherdCareStatus {
  return (
    typeof value === "string" &&
    SHEPHERD_CARE_STATUSES.has(value as ShepherdCareStatus)
  );
}

function isShepherdCareInteractionType(
  value: unknown,
): value is ShepherdCareInteractionType {
  return (
    typeof value === "string" &&
    SHEPHERD_CARE_INTERACTION_TYPES.has(value as ShepherdCareInteractionType)
  );
}

// Pure UTC "today" so a near-midnight server time doesn't flip the
// future-date guard for an interaction the admin entered moments ago.
function todayIsoUtc(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

function addDaysToIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const utc = Date.UTC(y, m - 1, d) + days * 86_400_000;
  return new Date(utc).toISOString().slice(0, 10);
}

export type UpsertShepherdCareProfilePayload = {
  shepherd_profile_id: string;
  set_current_status: boolean;
  current_status: ShepherdCareStatus;
  set_next_touchpoint_due: boolean;
  next_touchpoint_due: string | null;
  set_admin_summary: boolean;
  admin_summary: string | null;
};

export function validateUpsertShepherdCareProfilePayload(
  input: unknown,
): ValidationResult<UpsertShepherdCareProfilePayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.shepherd_profile_id)) {
    errors.push("shepherd_profile_id must be a uuid");
  }

  const setStatus = readBooleanFlag(input.set_current_status);
  const setNext = readBooleanFlag(input.set_next_touchpoint_due);
  const setSummary = readBooleanFlag(input.set_admin_summary);

  let status: ShepherdCareStatus = "healthy";
  if (setStatus) {
    if (!isShepherdCareStatus(input.current_status)) {
      errors.push("Status must be healthy, watch, or needs_attention.");
    } else {
      status = input.current_status;
    }
  }

  const nextRaw = readOptionalString(input.next_touchpoint_due);
  let next: string | null = null;
  if (setNext && nextRaw !== undefined) {
    if (!isIsoDate(nextRaw)) {
      errors.push("Next touchpoint date must be YYYY-MM-DD.");
    } else {
      next = nextRaw;
    }
  }

  const summaryRaw = readOptionalString(input.admin_summary);
  let summary: string | null = null;
  if (setSummary) {
    if (summaryRaw !== undefined) {
      if (summaryRaw.length > 2000) {
        errors.push("Summary is too long (max 2000 characters).");
      } else {
        summary = summaryRaw;
      }
    }
  }

  // At least one _set_ flag must be true; an upsert that changes
  // nothing would still write an audit row, which is wasteful.
  if (!setStatus && !setNext && !setSummary) {
    errors.push("Choose at least one field to update.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      shepherd_profile_id: normalizeUuid(input.shepherd_profile_id as string),
      set_current_status: setStatus,
      current_status: status,
      set_next_touchpoint_due: setNext,
      next_touchpoint_due: setNext ? next : null,
      set_admin_summary: setSummary,
      admin_summary: setSummary ? summary : null,
    },
  };
}

export type LogShepherdCareInteractionPayload = {
  shepherd_profile_id: string;
  interaction_at: string;
  interaction_type: ShepherdCareInteractionType;
  notes: string | null;
  set_next_touchpoint_due: boolean;
  next_touchpoint_due: string | null;
  set_current_status: boolean;
  current_status: ShepherdCareStatus;
};

export function validateLogShepherdCareInteractionPayload(
  input: unknown,
  options: { todayIso?: string } = {},
): ValidationResult<LogShepherdCareInteractionPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.shepherd_profile_id)) {
    errors.push("shepherd_profile_id must be a uuid");
  }

  const interactionAt = trimString(input.interaction_at) ?? "";
  if (interactionAt.length === 0) {
    errors.push("Interaction date is required.");
  } else if (!isIsoDate(interactionAt)) {
    errors.push("Interaction date must be YYYY-MM-DD.");
  } else {
    // Allow up to UTC today + 1 day so callers in time zones ahead of
    // UTC (e.g. Sydney at 8am local is still yesterday on the UTC
    // server) can log an interaction on their local current date. The
    // SQL guard mirrors this with `current_date + 1`.
    const today = options.todayIso ?? todayIsoUtc();
    const cap = addDaysToIsoDate(today, 1);
    if (interactionAt > cap) {
      errors.push("Interaction date can't be in the future.");
    }
  }

  if (!isShepherdCareInteractionType(input.interaction_type)) {
    errors.push("Interaction type must be call, text, in_person, meeting, or other.");
  }

  const notes = readOptionalString(input.notes);
  if (notes !== undefined && notes.length > 2000) {
    errors.push("Notes are too long (max 2000 characters).");
  }

  const setNext = readBooleanFlag(input.set_next_touchpoint_due);
  const setStatus = readBooleanFlag(input.set_current_status);

  const nextRaw = readOptionalString(input.next_touchpoint_due);
  let next: string | null = null;
  if (setNext && nextRaw !== undefined) {
    if (!isIsoDate(nextRaw)) {
      errors.push("Next touchpoint date must be YYYY-MM-DD.");
    } else {
      next = nextRaw;
    }
  }

  let status: ShepherdCareStatus = "healthy";
  if (setStatus) {
    if (!isShepherdCareStatus(input.current_status)) {
      errors.push("Status must be healthy, watch, or needs_attention.");
    } else {
      status = input.current_status;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      shepherd_profile_id: normalizeUuid(input.shepherd_profile_id as string),
      interaction_at: interactionAt,
      interaction_type: input.interaction_type as ShepherdCareInteractionType,
      notes: notes ?? null,
      set_next_touchpoint_due: setNext,
      next_touchpoint_due: setNext ? next : null,
      set_current_status: setStatus,
      current_status: status,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 5D.1 — Over-shepherd coverage tracking payloads (SC.2).
// ---------------------------------------------------------------------------
// Same return shape, same canonicalization conventions as SC.1A above.

const OVER_SHEPHERD_FULL_NAME_MAX = 200;
const OVER_SHEPHERD_NOTES_MAX = 2000;

function validateOverShepherdCommonFields(
  input: Record<string, unknown>,
  errors: string[],
): {
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
} {
  const fullName = trimString(input.full_name) ?? "";
  if (fullName.length === 0) {
    errors.push("Full name is required.");
  } else if (fullName.length > OVER_SHEPHERD_FULL_NAME_MAX) {
    errors.push(
      `Full name is too long (max ${OVER_SHEPHERD_FULL_NAME_MAX} characters).`,
    );
  }

  const email = readOptionalString(input.email);
  if (email !== undefined && !isEmail(email)) {
    errors.push("Email must be a valid address.");
  }

  const phone = readOptionalString(input.phone);
  if (phone !== undefined && !isPhone(phone)) {
    errors.push("Phone format is invalid.");
  }

  const notes = readOptionalString(input.notes);
  if (notes !== undefined && notes.length > OVER_SHEPHERD_NOTES_MAX) {
    errors.push(
      `Notes are too long (max ${OVER_SHEPHERD_NOTES_MAX} characters).`,
    );
  }

  return {
    full_name: fullName,
    email: email === undefined ? null : email.toLowerCase(),
    phone: phone === undefined ? null : phone,
    notes: notes === undefined ? null : notes,
  };
}

export type CreateOverShepherdPayload = {
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export function validateCreateOverShepherdPayload(
  input: unknown,
): ValidationResult<CreateOverShepherdPayload> {
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];
  const fields = validateOverShepherdCommonFields(input, errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: fields };
}

export type UpdateOverShepherdPayload = {
  over_shepherd_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
};

export function validateUpdateOverShepherdPayload(
  input: unknown,
): ValidationResult<UpdateOverShepherdPayload> {
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];

  if (!isUuid(input.over_shepherd_id)) {
    errors.push("over_shepherd_id must be a uuid");
  }

  const fields = validateOverShepherdCommonFields(input, errors);
  const active = readBooleanFlag(input.active);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      over_shepherd_id: normalizeUuid(input.over_shepherd_id as string),
      ...fields,
      active,
    },
  };
}

export type AssignShepherdCoveragePayload = {
  shepherd_profile_id: string;
  over_shepherd_id: string;
  assigned_at: string | null;
};

export function validateAssignShepherdCoveragePayload(
  input: unknown,
  options: { todayIso?: string } = {},
): ValidationResult<AssignShepherdCoveragePayload> {
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];

  if (!isUuid(input.shepherd_profile_id)) {
    errors.push("shepherd_profile_id must be a uuid");
  }
  if (!isUuid(input.over_shepherd_id)) {
    errors.push("over_shepherd_id must be a uuid");
  }

  const raw = readOptionalString(input.assigned_at);
  let assignedAt: string | null = null;
  if (raw !== undefined) {
    if (!isIsoDate(raw)) {
      errors.push("Assigned date must be YYYY-MM-DD.");
    } else {
      const today = options.todayIso ?? todayIsoUtc();
      const cap = addDaysToIsoDate(today, 1);
      if (raw > cap) {
        errors.push("Assigned date can't be in the future.");
      } else {
        assignedAt = raw;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      shepherd_profile_id: normalizeUuid(input.shepherd_profile_id as string),
      over_shepherd_id: normalizeUuid(input.over_shepherd_id as string),
      assigned_at: assignedAt,
    },
  };
}

export type EndShepherdCoverageAssignmentPayload = {
  assignment_id: string;
  ended_at: string | null;
};

export function validateEndShepherdCoverageAssignmentPayload(
  input: unknown,
  options: { todayIso?: string } = {},
): ValidationResult<EndShepherdCoverageAssignmentPayload> {
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];

  if (!isUuid(input.assignment_id)) {
    errors.push("assignment_id must be a uuid");
  }

  const raw = readOptionalString(input.ended_at);
  let endedAt: string | null = null;
  if (raw !== undefined) {
    if (!isIsoDate(raw)) {
      errors.push("Ended date must be YYYY-MM-DD.");
    } else {
      const today = options.todayIso ?? todayIsoUtc();
      const cap = addDaysToIsoDate(today, 1);
      if (raw > cap) {
        errors.push("Ended date can't be in the future.");
      } else {
        endedAt = raw;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      assignment_id: normalizeUuid(input.assignment_id as string),
      ended_at: endedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// LP.1 — launch-planning assumptions
// ---------------------------------------------------------------------------
//
// PATCH-style payload: every field is optional. The RPC merges submitted
// keys onto the stored row, so omitting a key leaves the existing default
// in place. Bounds here mirror the RPC body in
// supabase/migrations/20260518190000_phase_lp1_launch_planning.sql so the
// reject path can use friendlier messages while the RPC stays the trust
// boundary.

export type LaunchPlanningAssumptionsPayload = {
  current_church_attendance?: number;
  expected_growth?: number;
  expected_growth_date?: string | null;
  target_group_participation_pct?: number;
  average_group_size?: number;
  launch_buffer_pct?: number;
  leaders_per_new_group?: number;
  notes?: string | null;
};

const LAUNCH_PLANNING_KEYS: ReadonlySet<string> = new Set([
  "current_church_attendance",
  "expected_growth",
  "expected_growth_date",
  "target_group_participation_pct",
  "average_group_size",
  "launch_buffer_pct",
  "leaders_per_new_group",
  "notes",
]);

// Local numeric parser that accepts `number | numeric string` and rejects
// NaN / Infinity. Mirrors `readOptionalInteger` but allows non-integer
// values (percentages are fractions like 0.6).
function readOptionalNumber(value: unknown): number | undefined | "invalid" {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "invalid";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return "invalid";
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : "invalid";
  }
  return "invalid";
}

// Strict ISO calendar-date check: regex format + real-date verification.
// Catches Feb 30, Apr 31, etc. that the regex alone would accept.
function isRealIsoDate(value: string): boolean {
  if (!isIsoDate(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip: serialize back and compare so the calendar arithmetic
  // matches (e.g. 2026-02-30 -> 2026-03-02 round-trips differently).
  return d.toISOString().slice(0, 10) === value;
}

export function validateLaunchPlanningAssumptionsPayload(
  input: unknown,
): ValidationResult<LaunchPlanningAssumptionsPayload> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };

  for (const key of Object.keys(input)) {
    if (!LAUNCH_PLANNING_KEYS.has(key)) {
      errors.push(`Unknown setting key: ${key}`);
    }
  }

  const value: LaunchPlanningAssumptionsPayload = {};

  if ("current_church_attendance" in input) {
    const n = readOptionalInteger(input.current_church_attendance);
    if (n === "invalid")
      errors.push("Current church attendance must be a whole number.");
    else if (n !== undefined && (n < 0 || n > 100000))
      errors.push("Current church attendance must be between 0 and 100000.");
    else if (n !== undefined) value.current_church_attendance = n;
  }

  if ("expected_growth" in input) {
    const n = readOptionalInteger(input.expected_growth);
    if (n === "invalid") errors.push("Expected growth must be a whole number.");
    else if (n !== undefined && (n < -100000 || n > 100000))
      errors.push("Expected growth must be between -100000 and 100000.");
    else if (n !== undefined) value.expected_growth = n;
  }

  if ("expected_growth_date" in input) {
    const raw = input.expected_growth_date;
    if (raw === null) {
      value.expected_growth_date = null;
    } else if (raw === "" || raw === undefined) {
      // Form posts "" for a cleared date input -> treat as null.
      value.expected_growth_date = null;
    } else if (typeof raw !== "string") {
      errors.push("Expected growth date must be a YYYY-MM-DD string or null.");
    } else if (!isRealIsoDate(raw)) {
      errors.push("Expected growth date must be a valid YYYY-MM-DD date.");
    } else {
      value.expected_growth_date = raw;
    }
  }

  if ("target_group_participation_pct" in input) {
    const n = readOptionalNumber(input.target_group_participation_pct);
    if (n === "invalid")
      errors.push("Target group participation % must be a number between 0 and 1.");
    else if (n !== undefined && (n < 0 || n > 1))
      errors.push("Target group participation % must be between 0 and 1.");
    else if (n !== undefined) value.target_group_participation_pct = n;
  }

  if ("average_group_size" in input) {
    const n = readOptionalInteger(input.average_group_size);
    if (n === "invalid") errors.push("Average group size must be a whole number.");
    else if (n !== undefined && (n < 1 || n > 500))
      errors.push("Average group size must be between 1 and 500.");
    else if (n !== undefined) value.average_group_size = n;
  }

  if ("launch_buffer_pct" in input) {
    const n = readOptionalNumber(input.launch_buffer_pct);
    if (n === "invalid")
      errors.push("Launch buffer % must be a number between 0 and 0.95.");
    else if (n !== undefined && (n < 0 || n > 0.95))
      // Cap below 1 so the (1 - buffer) denominator in computeLaunchPlan
      // can never reach zero.
      errors.push("Launch buffer % must be between 0 and 0.95.");
    else if (n !== undefined) value.launch_buffer_pct = n;
  }

  if ("leaders_per_new_group" in input) {
    const n = readOptionalInteger(input.leaders_per_new_group);
    if (n === "invalid") errors.push("Leaders per new group must be a whole number.");
    else if (n !== undefined && (n < 0 || n > 10))
      errors.push("Leaders per new group must be between 0 and 10.");
    else if (n !== undefined) value.leaders_per_new_group = n;
  }

  if ("notes" in input) {
    const raw = input.notes;
    if (raw === null || raw === undefined) {
      value.notes = null;
    } else if (typeof raw !== "string") {
      errors.push("Notes must be a string or null.");
    } else {
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        value.notes = null;
      } else if (trimmed.length > 2000) {
        errors.push("Notes must be 2000 characters or fewer.");
      } else {
        value.notes = trimmed;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}
