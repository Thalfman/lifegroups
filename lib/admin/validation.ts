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

// Re-exported for tests and Phase 5A.1 callers that need canonical comparisons.
export { normalizeUuid };
