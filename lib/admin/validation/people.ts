import type { RoleInGroup, UserRole } from "@/types/enums";
import { isUuid } from "@/lib/shared/uuid";
import { isUserRole } from "@/lib/auth/roles";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  trimString,
  readOptionalString,
  isEmail,
  isPhone,
  normalizeUuid,
} from "./shared";

export type CreateMinistryAdminPayload = {
  full_name: string;
  email: string;
};

export function validateCreateMinistryAdminPayload(
  input: unknown
): ValidationResult<CreateMinistryAdminPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
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
  input: unknown
): ValidationResult<CreateLeaderProfilePayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const fullName = trimString(input.full_name) ?? "";
  const email = trimString(input.email) ?? "";
  const phone = readOptionalString(input.phone);
  if (fullName.length === 0) errors.push("full_name is required");
  if (!isEmail(email)) errors.push("email must be a valid address");
  if (phone !== undefined && !isPhone(phone))
    errors.push("phone format is invalid");
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
  input: unknown
): ValidationResult<CreateMemberPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const fullName = trimString(input.full_name) ?? "";
  const email = readOptionalString(input.email);
  const phone = readOptionalString(input.phone);
  if (fullName.length === 0) errors.push("full_name is required");
  if (email !== undefined && !isEmail(email))
    errors.push("email must be a valid address");
  if (phone !== undefined && !isPhone(phone))
    errors.push("phone format is invalid");
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
  input: unknown
): ValidationResult<AssignLeaderToGroupPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
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
  input: unknown
): ValidationResult<AssignMemberToGroupPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
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

// Group roster create-and-assign (#643): one payload that both creates a person
// and names the group to put them on. A discriminated union on `kind` so a
// leader carries the required email + in-group role while a member keeps email
// optional and never carries a role — the same field rules the standalone
// create validators enforce, plus the fixed group_id.
export type AddPersonToGroupPayload =
  | {
      group_id: string;
      kind: "member";
      full_name: string;
      email?: string;
      phone?: string;
    }
  | {
      group_id: string;
      kind: "leader";
      full_name: string;
      email: string;
      phone?: string;
      role: Extract<RoleInGroup, "leader" | "co_leader">;
    };

export function validateAddPersonToGroupPayload(
  input: unknown
): ValidationResult<AddPersonToGroupPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.group_id)) errors.push("group_id must be a uuid");
  const kind = input.kind;
  if (kind !== "member" && kind !== "leader") {
    errors.push("kind must be 'member' or 'leader'");
  }

  const fullName = trimString(input.full_name) ?? "";
  if (fullName.length === 0) errors.push("full_name is required");
  const phone = readOptionalString(input.phone);
  if (phone !== undefined && !isPhone(phone))
    errors.push("phone format is invalid");

  if (kind === "leader") {
    const email = trimString(input.email) ?? "";
    if (!isEmail(email)) errors.push("email must be a valid address");
    if (input.role !== "leader" && input.role !== "co_leader") {
      errors.push("role must be 'leader' or 'co_leader'");
    }
    if (errors.length > 0) return { ok: false, errors };
    const value: Extract<AddPersonToGroupPayload, { kind: "leader" }> = {
      group_id: normalizeUuid(input.group_id as string),
      kind: "leader",
      full_name: fullName,
      email,
      role: input.role as "leader" | "co_leader",
    };
    if (phone !== undefined) value.phone = phone;
    return { ok: true, value };
  }

  // Member branch (kind === "member"): email is optional.
  const email = readOptionalString(input.email);
  if (email !== undefined && !isEmail(email))
    errors.push("email must be a valid address");
  if (errors.length > 0) return { ok: false, errors };
  const value: Extract<AddPersonToGroupPayload, { kind: "member" }> = {
    group_id: normalizeUuid(input.group_id as string),
    kind: "member",
    full_name: fullName,
  };
  if (email !== undefined) value.email = email;
  if (phone !== undefined) value.phone = phone;
  return { ok: true, value };
}

// Roster removal (Groups/People overhaul): the inverse of the two assign
// payloads — one person off one group's roster, person status untouched.

export type UnassignLeaderFromGroupPayload = {
  group_id: string;
  profile_id: string;
};

export function validateUnassignLeaderFromGroupPayload(
  input: unknown
): ValidationResult<UnassignLeaderFromGroupPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.group_id)) errors.push("group_id must be a uuid");
  if (!isUuid(input.profile_id)) errors.push("profile_id must be a uuid");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      group_id: normalizeUuid(input.group_id as string),
      profile_id: normalizeUuid(input.profile_id as string),
    },
  };
}

export type EndGroupMembershipPayload = {
  group_id: string;
  member_id: string;
};

export function validateEndGroupMembershipPayload(
  input: unknown
): ValidationResult<EndGroupMembershipPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
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
  input: unknown
): ValidationResult<DeactivateProfilePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.profile_id))
    return { ok: false, errors: ["profile_id must be a uuid"] };
  return {
    ok: true,
    value: { profile_id: normalizeUuid(input.profile_id as string) },
  };
}

export type DeactivateMemberPayload = { member_id: string };

export function validateDeactivateMemberPayload(
  input: unknown
): ValidationResult<DeactivateMemberPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.member_id))
    return { ok: false, errors: ["member_id must be a uuid"] };
  return {
    ok: true,
    value: { member_id: normalizeUuid(input.member_id as string) },
  };
}

export type ChangeUserRolePayload = {
  profile_id: string;
  new_role: UserRole;
};

export function validateChangeUserRolePayload(
  input: unknown
): ValidationResult<ChangeUserRolePayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.profile_id)) errors.push("profile_id must be a uuid");
  if (!isUserRole(input.new_role))
    errors.push("new_role must be a valid user_role");
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
  targetProfileId: string
): string | null {
  if (normalizeUuid(actorProfileId) === normalizeUuid(targetProfileId)) {
    return "Admins cannot perform this action against their own profile.";
  }
  return null;
}

export function guardAgainstSelfRoleChange(
  actor: { id: string; role: UserRole },
  payload: ChangeUserRolePayload
): string | null {
  if (normalizeUuid(actor.id) === normalizeUuid(payload.profile_id)) {
    return "Admins cannot change their own role.";
  }
  return null;
}

export function guardAgainstSuperAdminAssignment(
  payload: ChangeUserRolePayload
): string | null {
  if (payload.new_role === "super_admin") {
    return "super_admin cannot be assigned through the app. Use the documented bootstrap procedure.";
  }
  return null;
}

export type ChangeLeaderRolePayload = {
  profile_id: string;
  new_role: "leader" | "co_leader";
};

export function validateChangeLeaderRolePayload(
  input: unknown
): ValidationResult<ChangeLeaderRolePayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
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
