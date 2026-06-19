import { isUuid } from "@/lib/shared/uuid";
import { APP_CONFIG_TRACER_MAX_LENGTH } from "@/lib/admin/app-config-decode";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  trimString,
  readOptionalString,
  isEmail,
  isPhone,
  normalizeUuid,
  isIsoDate,
} from "./shared";

// Phase SAC.1 (#159): Super Admin Console platform-config write payload. The
// foundation slice carries a single editable key — the round-trip tracer — and
// an empty string is a valid value (clearing the note), so unlike most optional
// fields we keep "" rather than normalizing it away.
export type PlatformConfigPayload = {
  console_tracer_note: string;
};

export function validatePlatformConfigPayload(
  input: unknown
): ValidationResult<PlatformConfigPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const raw = input.console_tracer_note;
  // A missing field is treated as the empty (cleared) note; a non-string,
  // non-null value is a malformed submission.
  const note = typeof raw === "string" ? raw : raw == null ? "" : null;
  if (note === null) {
    return { ok: false, errors: ["Tracer note must be text."] };
  }
  if (note.length > APP_CONFIG_TRACER_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        `Tracer note must be ${APP_CONFIG_TRACER_MAX_LENGTH} characters or fewer.`,
      ],
    };
  }

  return { ok: true, value: { console_tracer_note: note } };
}

// Phase SAC.3 (#163): set a profile's active/inactive status from the Super
// Admin Console. The self-target and bootstrap-super_admin guards are enforced
// server-side in the RPC; this is the shape + status-enum check.
export type SetProfileStatusPayload = {
  profile_id: string;
  status: "active" | "inactive";
};

export function validateSetProfileStatusPayload(
  input: unknown
): ValidationResult<SetProfileStatusPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.profile_id)) errors.push("profile_id must be a uuid");
  if (input.status !== "active" && input.status !== "inactive") {
    errors.push("status must be 'active' or 'inactive'");
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      profile_id: normalizeUuid(input.profile_id as string),
      status: input.status as "active" | "inactive",
    },
  };
}

// Phase SAC.4 (#164): assign / end over-shepherd → leader coverage from the
// console. Dates are optional ISO strings (the RPC defaults to current_date).
export type AssignCoveragePayload = {
  shepherd_profile_id: string;
  over_shepherd_id: string;
  assigned_at: string | null;
};

export function validateAssignCoveragePayload(
  input: unknown
): ValidationResult<AssignCoveragePayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.shepherd_profile_id))
    errors.push("shepherd_profile_id must be a uuid");
  if (!isUuid(input.over_shepherd_id))
    errors.push("over_shepherd_id must be a uuid");
  const assignedAt = readOptionalString(input.assigned_at);
  if (assignedAt !== undefined && !isIsoDate(assignedAt))
    errors.push("Assigned date must be YYYY-MM-DD.");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      shepherd_profile_id: normalizeUuid(input.shepherd_profile_id as string),
      over_shepherd_id: normalizeUuid(input.over_shepherd_id as string),
      assigned_at: assignedAt ?? null,
    },
  };
}

export type EndCoveragePayload = {
  assignment_id: string;
  ended_at: string | null;
};

export function validateEndCoveragePayload(
  input: unknown
): ValidationResult<EndCoveragePayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.assignment_id)) errors.push("assignment_id must be a uuid");
  const endedAt = readOptionalString(input.ended_at);
  if (endedAt !== undefined && !isIsoDate(endedAt))
    errors.push("End date must be YYYY-MM-DD.");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      assignment_id: normalizeUuid(input.assignment_id as string),
      ended_at: endedAt ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 5A.7 — Super admin invite user payload.
// ---------------------------------------------------------------------------

// Roles the invite form is allowed to assign. super_admin is forbidden
// (bootstrap procedure only). over_shepherd is invitable so the coach login
// tier can be provisioned from
// the app (docs/adr/0002-oversight-ladder-and-leader-gating.md, Codex #3); it
// takes no group assignment, like ministry_admin.
const INVITE_USER_ROLES: ReadonlySet<
  "ministry_admin" | "over_shepherd" | "leader" | "co_leader"
> = new Set(["ministry_admin", "over_shepherd", "leader", "co_leader"]);

// No full_name: the invitee chooses their own name at account setup
// (ADR 0025); the inviter never types it.
export type InviteUserPayload = {
  email: string; // canonicalized lowercase
  role: "ministry_admin" | "over_shepherd" | "leader" | "co_leader";
  phone?: string;
  group_id?: string;
};

export function validateInviteUserPayload(
  input: unknown
): ValidationResult<InviteUserPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const emailRaw = trimString(input.email) ?? "";
  const email = emailRaw.toLowerCase();
  const phone = readOptionalString(input.phone);
  const groupIdRaw = readOptionalString(input.group_id);
  const role = typeof input.role === "string" ? input.role : "";

  if (email.length === 0) errors.push("Email is required.");
  else if (!isEmail(email)) errors.push("Email must be a valid address.");
  if (!INVITE_USER_ROLES.has(role as InviteUserPayload["role"])) {
    errors.push(
      "Role must be Ministry Admin, Over-Shepherd, Shepherd, or Co-Shepherd."
    );
  }
  if (phone !== undefined && !isPhone(phone))
    errors.push("Phone format is invalid.");
  if (groupIdRaw !== undefined && !isUuid(groupIdRaw))
    errors.push("Group selection is invalid.");
  // Neither ministry_admin nor over_shepherd is a group leader, so neither
  // takes a group assignment.
  if (
    (role === "ministry_admin" || role === "over_shepherd") &&
    groupIdRaw !== undefined
  ) {
    errors.push(
      role === "over_shepherd"
        ? "Over-Shepherds are not assigned to a group."
        : "Ministry admins are not assigned to a group."
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: InviteUserPayload = {
    email,
    role: role as InviteUserPayload["role"],
  };
  if (phone !== undefined) value.phone = phone;
  if (groupIdRaw !== undefined) value.group_id = normalizeUuid(groupIdRaw);
  return { ok: true, value };
}
