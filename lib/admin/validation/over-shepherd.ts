import { isUuid } from "@/lib/shared/uuid";
import { NOTE_MAX_CHARS } from "@/lib/shared/limits";
import { addDaysIso } from "@/lib/shared/church-time";
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
  todayIsoUtc,
} from "./shared";

// ---------------------------------------------------------------------------
// Phase 5D.1 — Over-shepherd coverage tracking payloads (SC.2).
// ---------------------------------------------------------------------------
// Same return shape, same canonicalization conventions as the shepherd-care
// (SC.1A) validators.

const OVER_SHEPHERD_FULL_NAME_MAX = 200;
const OVER_SHEPHERD_NOTES_MAX = NOTE_MAX_CHARS;

function validateOverShepherdCommonFields(
  input: Record<string, unknown>,
  errors: string[]
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
      `Full name is too long (max ${OVER_SHEPHERD_FULL_NAME_MAX} characters).`
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
      `Notes are too long (max ${OVER_SHEPHERD_NOTES_MAX} characters).`
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
  input: unknown
): ValidationResult<CreateOverShepherdPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];
  const fields = validateOverShepherdCommonFields(input, errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: fields };
}

// Phase LDR.1 (#126): the over-shepherd broad-note write payload. Deliberately
// minimal — a Shepherd id (the coverage target) plus the broad note. No status,
// touchpoint, interaction type, admin summary, or private-note fields reach
// this surface.
export type OverShepherdBroadNotePayload = {
  shepherd_profile_id: string;
  note: string;
};

export function validateOverShepherdBroadNotePayload(
  input: unknown
): ValidationResult<OverShepherdBroadNotePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];

  if (!isUuid(input.shepherd_profile_id)) {
    errors.push("shepherd_profile_id must be a uuid");
  }

  const note = trimString(input.note);
  if (note === null || note.length === 0) {
    errors.push("A broad note is required.");
  } else if (note.length > OVER_SHEPHERD_NOTES_MAX) {
    errors.push(
      `Note is too long (max ${OVER_SHEPHERD_NOTES_MAX} characters).`
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      shepherd_profile_id: normalizeUuid(input.shepherd_profile_id as string),
      note: note as string,
    },
  };
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
  input: unknown
): ValidationResult<UpdateOverShepherdPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
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

// Admin UX: a focused active toggle for the list/detail Archive/Restore button.
// Shape-only — the RPC owns the soft-archive/restore + archived_at maintenance.
export type SetOverShepherdActivePayload = {
  over_shepherd_id: string;
  active: boolean;
};

export function validateSetOverShepherdActivePayload(
  input: unknown
): ValidationResult<SetOverShepherdActivePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.over_shepherd_id))
    return { ok: false, errors: ["over_shepherd_id must be a uuid"] };
  return {
    ok: true,
    value: {
      over_shepherd_id: normalizeUuid(input.over_shepherd_id as string),
      active: readBooleanFlag(input.active),
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
  options: { todayIso?: string } = {}
): ValidationResult<AssignShepherdCoveragePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
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
      const cap = addDaysIso(today, 1);
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
  options: { todayIso?: string } = {}
): ValidationResult<EndShepherdCoverageAssignmentPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
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
      const cap = addDaysIso(today, 1);
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
