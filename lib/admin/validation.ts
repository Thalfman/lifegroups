import type { UserRole, RoleInGroup } from "@/types/enums";

// Phase 5A.0 validation contracts: pure TypeScript, no I/O, no Supabase. Reused by Phase 5A.1 server actions when writes are enabled.

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// At least one digit; allow common phone punctuation; 7–20 chars total.
const PHONE_RE = /^(?=[^\d]*\d)[+0-9().\- ]{7,20}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USER_ROLES: ReadonlySet<UserRole> = new Set([
  "super_admin",
  "ministry_admin",
  "staff_viewer",
  "leader",
  "co_leader",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
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

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Postgres stores UUIDs lowercase; canonicalize before any equality check
// so case-only variants of an actor's own id cannot bypass self-target guards.
function normalizeUuid(value: string): string {
  return value.toLowerCase();
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.has(value as UserRole);
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

export type GroupWritablePayload = {
  name: string;
  description?: string;
  meeting_day?: string;
  meeting_time?: string;
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

  if (name.length === 0) errors.push("Group name is required.");
  if (name.length > 120) errors.push("Group name is too long (max 120 characters).");
  if (description !== undefined && description.length > 500)
    errors.push("Description is too long (max 500 characters).");
  if (meetingDay !== undefined && meetingDay.length > 40)
    errors.push("Meeting day is too long.");
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

  const value: GroupWritablePayload = { name };
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
};

const METRIC_DEFAULT_KEYS: ReadonlySet<string> = new Set([
  "default_group_capacity",
  "capacity_warning_threshold_pct",
  "capacity_full_threshold_pct",
  "check_in_due_day_of_week",
  "missed_checkin_warning_weeks",
  "default_healthy_attendance_pct",
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

// Re-exported for tests and Phase 5A.1 callers that need canonical comparisons.
export { normalizeUuid };
