import type {
  FollowUpPriority,
  FollowUpStatus,
  FollowUpType,
} from "@/types/enums";
import { isUuid } from "@/lib/shared/uuid";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  trimString,
  readOptionalString,
  normalizeUuid,
  isIsoDate,
  readBooleanFlag,
} from "./shared";

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

function isFollowUpType(value: unknown): value is FollowUpType {
  return (
    typeof value === "string" && FOLLOW_UP_TYPES.has(value as FollowUpType)
  );
}

function isFollowUpPriority(value: unknown): value is FollowUpPriority {
  return (
    typeof value === "string" &&
    FOLLOW_UP_PRIORITIES.has(value as FollowUpPriority)
  );
}

function isFollowUpStatus(value: unknown): value is FollowUpStatus {
  return (
    typeof value === "string" && FOLLOW_UP_STATUSES.has(value as FollowUpStatus)
  );
}

function isLeaderFollowUpStatus(value: unknown): value is FollowUpStatus {
  return (
    typeof value === "string" &&
    LEADER_FOLLOW_UP_STATUSES.has(value as FollowUpStatus)
  );
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
  input: unknown
): ValidationResult<CreateFollowUpPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const title = trimString(input.title) ?? "";
  if (title.length === 0) errors.push("Title is required.");
  if (title.length > 200)
    errors.push("Title is too long (max 200 characters).");

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

  if (group !== undefined && !isUuid(group))
    errors.push("Related group is invalid.");
  if (member !== undefined && !isUuid(member))
    errors.push("Related member is invalid.");
  if (guest !== undefined && !isUuid(guest))
    errors.push("Related guest is invalid.");
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
  input: unknown
): ValidationResult<AdminUpdateFollowUpStatusPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.follow_up_id)) errors.push("follow_up_id must be a uuid");
  if (!isFollowUpStatus(input.status))
    errors.push("Status isn't a valid value.");

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
      leader_visible_note: setLeader ? (leaderNote ?? null) : null,
      set_admin_private_note: setAdmin,
      admin_private_note: setAdmin ? (adminNote ?? null) : null,
    },
  };
}

export type LeaderUpdateFollowUpStatusPayload = {
  follow_up_id: string;
  status: "in_progress" | "done";
};

export function validateLeaderUpdateFollowUpStatusPayload(
  input: unknown
): ValidationResult<LeaderUpdateFollowUpStatusPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
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
