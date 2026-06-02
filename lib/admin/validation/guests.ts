import type { GuestPipelineStage } from "@/types/enums";
import { isUuid } from "@/lib/shared/uuid";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  trimString,
  readOptionalString,
  isEmail,
  isPhone,
  normalizeUuid,
  isIsoDate,
  readBooleanFlag,
} from "./shared";

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

function isPipelineStage(value: unknown): value is GuestPipelineStage {
  return (
    typeof value === "string" &&
    GUEST_PIPELINE_STAGES.has(value as GuestPipelineStage)
  );
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
  input: unknown
): ValidationResult<CreateGuestPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const fullName = trimString(input.full_name) ?? "";
  const email = readOptionalString(input.email);
  const phone = readOptionalString(input.phone);
  const firstAttendedGroupId = readOptionalString(
    input.first_attended_group_id
  );
  const firstAttendedDate = readOptionalString(input.first_attended_date);
  const assignedGroupId = readOptionalString(input.assigned_group_id);
  const followUpOwnerId = readOptionalString(input.follow_up_owner_id);
  const notes = readOptionalString(input.notes);
  const rawStage = readOptionalString(input.pipeline_stage);
  const stage: GuestPipelineStage =
    rawStage !== undefined ? (rawStage as GuestPipelineStage) : "new";

  if (fullName.length === 0) errors.push("Guest name is required.");
  if (fullName.length > 120)
    errors.push("Guest name is too long (max 120 characters).");
  if (email !== undefined && !isEmail(email))
    errors.push("Email must be a valid address.");
  if (phone !== undefined && !isPhone(phone))
    errors.push("Phone format is invalid.");
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
      assigned_group_id: assignedGroupId
        ? normalizeUuid(assignedGroupId)
        : null,
      follow_up_owner_id: followUpOwnerId
        ? normalizeUuid(followUpOwnerId)
        : null,
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
  input: unknown
): ValidationResult<UpdateGuestPipelinePayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

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
      assigned_group_id:
        setAssigned && assignedRaw ? normalizeUuid(assignedRaw) : null,
      set_follow_up_owner_id: setOwner,
      follow_up_owner_id: setOwner && ownerRaw ? normalizeUuid(ownerRaw) : null,
      set_notes: setNotes,
      notes: setNotes ? (notesRaw ?? null) : null,
    },
  };
}
