import type { ShepherdCareFollowUpStatus } from "@/types/enums";
import { isUuid } from "@/lib/shared/uuid";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  trimString,
  readOptionalString,
  normalizeUuid,
  isIsoDate,
  readBooleanFlag,
  makeIdPayloadValidator,
} from "./shared";

// ---------------------------------------------------------------------------
// Phase SC.1B — Shepherd care follow-up (task list) payloads.
// ---------------------------------------------------------------------------
// Admin-only care follow-ups. Title bounded at 200 chars (a scannable
// next-step), notes at 2000 (consistent with care interaction notes). The
// status transition rule itself lives in the pure helper + the RPC; the
// validator only checks the submitted status is a legal value.

const SHEPHERD_CARE_FOLLOW_UP_STATUSES: ReadonlySet<ShepherdCareFollowUpStatus> =
  new Set(["open", "in_progress", "done"]);

function isShepherdCareFollowUpStatusValue(
  value: unknown
): value is ShepherdCareFollowUpStatus {
  return (
    typeof value === "string" &&
    SHEPHERD_CARE_FOLLOW_UP_STATUSES.has(value as ShepherdCareFollowUpStatus)
  );
}

export type CreateShepherdCareFollowUpPayload = {
  care_profile_id: string;
  title: string;
  due_date: string | null;
  notes: string | null;
};

export function validateCreateShepherdCareFollowUpPayload(
  input: unknown
): ValidationResult<CreateShepherdCareFollowUpPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.care_profile_id)) {
    errors.push("care_profile_id must be a uuid");
  }

  const title = trimString(input.title) ?? "";
  if (title.length === 0) errors.push("Title is required.");
  if (title.length > 200)
    errors.push("Title is too long (max 200 characters).");

  const dueRaw = readOptionalString(input.due_date);
  let dueDate: string | null = null;
  if (dueRaw !== undefined) {
    if (!isIsoDate(dueRaw)) errors.push("Due date must be YYYY-MM-DD.");
    else dueDate = dueRaw;
  }

  const notes = readOptionalString(input.notes);
  if (notes !== undefined && notes.length > 2000) {
    errors.push("Notes are too long (max 2000 characters).");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      care_profile_id: normalizeUuid(input.care_profile_id as string),
      title,
      due_date: dueDate,
      notes: notes ?? null,
    },
  };
}

export type UpdateShepherdCareFollowUpStatusPayload = {
  follow_up_id: string;
  status: ShepherdCareFollowUpStatus;
};

export function validateUpdateShepherdCareFollowUpStatusPayload(
  input: unknown
): ValidationResult<UpdateShepherdCareFollowUpStatusPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.follow_up_id)) errors.push("follow_up_id must be a uuid");
  if (!isShepherdCareFollowUpStatusValue(input.status)) {
    errors.push("Status must be open, in_progress, or done.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      follow_up_id: normalizeUuid(input.follow_up_id as string),
      status: input.status as ShepherdCareFollowUpStatus,
    },
  };
}

// Admin UX: soft-archive a care follow-up (cleanup). Shape-only — the RPC is the
// authoritative gate (missing_follow_up, active-target re-check).
export type ArchiveShepherdCareFollowUpPayload = {
  follow_up_id: string;
};

export const validateArchiveShepherdCareFollowUpPayload: (
  input: unknown
) => ValidationResult<ArchiveShepherdCareFollowUpPayload> =
  makeIdPayloadValidator("follow_up_id");

export type UpdateShepherdCareFollowUpPayload = {
  follow_up_id: string;
  title: string;
  set_due_date: boolean;
  due_date: string | null;
  set_notes: boolean;
  notes: string | null;
};

export function validateUpdateShepherdCareFollowUpPayload(
  input: unknown
): ValidationResult<UpdateShepherdCareFollowUpPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.follow_up_id)) errors.push("follow_up_id must be a uuid");

  const title = trimString(input.title) ?? "";
  if (title.length === 0) errors.push("Title is required.");
  if (title.length > 200)
    errors.push("Title is too long (max 200 characters).");

  const setDue = readBooleanFlag(input.set_due_date);
  const setNotes = readBooleanFlag(input.set_notes);

  const dueRaw = readOptionalString(input.due_date);
  let dueDate: string | null = null;
  if (setDue && dueRaw !== undefined) {
    if (!isIsoDate(dueRaw)) errors.push("Due date must be YYYY-MM-DD.");
    else dueDate = dueRaw;
  }

  const notesRaw = readOptionalString(input.notes);
  if (setNotes && notesRaw !== undefined && notesRaw.length > 2000) {
    errors.push("Notes are too long (max 2000 characters).");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      follow_up_id: normalizeUuid(input.follow_up_id as string),
      title,
      set_due_date: setDue,
      due_date: setDue ? dueDate : null,
      set_notes: setNotes,
      notes: setNotes ? (notesRaw ?? null) : null,
    },
  };
}
