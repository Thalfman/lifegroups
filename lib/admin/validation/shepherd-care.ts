import type {
  ShepherdCareFollowUpStatus,
  ShepherdCareInteractionType,
  ShepherdCareStatus,
} from "@/types/enums";
import { isUuid } from "@/lib/shared/uuid";
import { addDaysIso } from "@/lib/shared/church-time";
import { base64ToBytes } from "@/lib/crypto/encoding";
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
  makeIdPayloadValidator,
} from "./shared";

// ---------------------------------------------------------------------------
// Phase 5D.0 — Shepherd care tracker payloads.
// ---------------------------------------------------------------------------

const SHEPHERD_CARE_STATUSES: ReadonlySet<ShepherdCareStatus> = new Set([
  "doing_well",
  "needs_encouragement",
  "needs_follow_up",
  "concern",
  "inactive",
]);

const SHEPHERD_CARE_INTERACTION_TYPES: ReadonlySet<ShepherdCareInteractionType> =
  new Set(["call", "text", "in_person", "meeting", "other"]);

function isShepherdCareStatus(value: unknown): value is ShepherdCareStatus {
  return (
    typeof value === "string" &&
    SHEPHERD_CARE_STATUSES.has(value as ShepherdCareStatus)
  );
}

function isShepherdCareInteractionType(
  value: unknown
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
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
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
  input: unknown
): ValidationResult<UpsertShepherdCareProfilePayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.shepherd_profile_id)) {
    errors.push("shepherd_profile_id must be a uuid");
  }

  const setStatus = readBooleanFlag(input.set_current_status);
  const setNext = readBooleanFlag(input.set_next_touchpoint_due);
  const setSummary = readBooleanFlag(input.set_admin_summary);

  let status: ShepherdCareStatus = "doing_well";
  if (setStatus) {
    if (!isShepherdCareStatus(input.current_status)) {
      errors.push(
        "Status must be doing_well, needs_encouragement, needs_follow_up, concern, or inactive."
      );
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
  options: { todayIso?: string } = {}
): ValidationResult<LogShepherdCareInteractionPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

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
    const cap = addDaysIso(today, 1);
    if (interactionAt > cap) {
      errors.push("Interaction date can't be in the future.");
    }
  }

  if (!isShepherdCareInteractionType(input.interaction_type)) {
    errors.push(
      "Interaction type must be call, text, in_person, meeting, or other."
    );
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

  let status: ShepherdCareStatus = "doing_well";
  if (setStatus) {
    if (!isShepherdCareStatus(input.current_status)) {
      errors.push(
        "Status must be doing_well, needs_encouragement, needs_follow_up, concern, or inactive."
      );
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

// ---------------------------------------------------------------------------
// Phase 5D.1 — Over-shepherd coverage tracking payloads (SC.2).
// ---------------------------------------------------------------------------
// Same return shape, same canonicalization conventions as SC.1A above.

const OVER_SHEPHERD_FULL_NAME_MAX = 200;
const OVER_SHEPHERD_NOTES_MAX = 2000;

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
  } else if (note.length > 2000) {
    errors.push("Note is too long (max 2000 characters).");
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

// ----- Phase SC.4 — private care note (encrypted body upsert) -------------

// Base64 of arbitrary bytes: standard alphabet, optional padding, length a
// multiple of 4. Content-blind — the body is opaque ciphertext to the server.
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

// 1 MiB of ciphertext -> ~1.4M base64 chars; cap generously. The RPC enforces
// the authoritative octet bounds; this is content-free defense-in-depth.
const MAX_CIPHERTEXT_BASE64 = 1_500_000;

function isBase64Blob(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length % 4 === 0 &&
    BASE64_RE.test(value)
  );
}

export type UpsertShepherdCarePrivateNotePayload = {
  care_profile_id: string;
  set_body: boolean;
  ciphertext: string | null;
  iv: string | null;
  dek_version: number;
};

export function validateUpsertShepherdCarePrivateNotePayload(
  input: unknown
): ValidationResult<UpsertShepherdCarePrivateNotePayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.care_profile_id)) {
    errors.push("care_profile_id must be a uuid");
  }

  const dekVersion =
    typeof input.dek_version === "number"
      ? input.dek_version
      : Number(input.dek_version);
  if (!Number.isInteger(dekVersion) || dekVersion < 1 || dekVersion > 32767) {
    errors.push("dek_version must be a positive smallint.");
  }

  const setBody = readBooleanFlag(input.set_body);
  let ciphertext: string | null = null;
  let iv: string | null = null;

  if (setBody) {
    if (!isBase64Blob(input.ciphertext)) {
      errors.push("Encrypted note body is missing or malformed.");
    } else if (input.ciphertext.length > MAX_CIPHERTEXT_BASE64) {
      errors.push("Encrypted note body is too large.");
    } else {
      ciphertext = input.ciphertext;
    }
    if (!isBase64Blob(input.iv)) {
      errors.push("Encryption nonce is missing or malformed.");
    } else {
      iv = input.iv;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      care_profile_id: normalizeUuid(input.care_profile_id as string),
      set_body: setBody,
      ciphertext,
      iv,
      dek_version: dekVersion,
    },
  };
}

export type PrivateNoteKeySlotInput = {
  slot_type: "passkey" | "recovery";
  credential_id: string | null;
  label: string | null;
  prf_salt: string | null;
  hkdf_salt: string;
  wrapped_dek: string;
  wrap_iv: string;
};

export type EnrollPrivateNoteKeysPayload = {
  dek_version: number;
  slots: PrivateNoteKeySlotInput[];
};

function isOptionalBase64(value: unknown): value is string | null {
  return value === null || value === undefined || isBase64Blob(value);
}

// Fixed byte lengths the crypto module always produces (lib/crypto/private-notes.ts):
// HKDF salt 16, GCM nonce 12, wrapped DEK 48 (32-byte DEK + 16-byte tag), PRF
// salt 32. Reject anything else so a malformed slot can't be persisted and then
// permanently lock the creator out behind the once-per-creator enroll guard.
const HKDF_SALT_BYTES = 16;
const WRAP_IV_BYTES = 12;
const WRAPPED_DEK_BYTES = 48;
const PRF_SALT_BYTES = 32;
const MAX_CREDENTIAL_ID_BYTES = 1024;

function isBase64OfLength(value: string, bytes: number): boolean {
  return base64ToBytes(value).length === bytes;
}

function validateKeySlot(
  raw: unknown,
  index: number,
  errors: string[]
): PrivateNoteKeySlotInput | null {
  if (!isRecord(raw)) {
    errors.push(`Key slot ${index} is malformed.`);
    return null;
  }
  const slotType = raw.slot_type;
  if (slotType !== "passkey" && slotType !== "recovery") {
    errors.push(`Key slot ${index} has an unknown type.`);
    return null;
  }
  if (
    !isBase64Blob(raw.hkdf_salt) ||
    !isBase64Blob(raw.wrapped_dek) ||
    !isBase64Blob(raw.wrap_iv)
  ) {
    errors.push(`Key slot ${index} is missing wrapped-key material.`);
    return null;
  }
  if (
    !isBase64OfLength(raw.hkdf_salt, HKDF_SALT_BYTES) ||
    !isBase64OfLength(raw.wrap_iv, WRAP_IV_BYTES) ||
    !isBase64OfLength(raw.wrapped_dek, WRAPPED_DEK_BYTES)
  ) {
    errors.push(
      `Key slot ${index} has wrapped-key material of the wrong size.`
    );
    return null;
  }
  if (!isOptionalBase64(raw.credential_id) || !isOptionalBase64(raw.prf_salt)) {
    errors.push(`Key slot ${index} has malformed passkey material.`);
    return null;
  }
  if (
    typeof raw.prf_salt === "string" &&
    !isBase64OfLength(raw.prf_salt, PRF_SALT_BYTES)
  ) {
    errors.push(`Key slot ${index} has a PRF salt of the wrong size.`);
    return null;
  }
  if (
    typeof raw.credential_id === "string" &&
    base64ToBytes(raw.credential_id).length > MAX_CREDENTIAL_ID_BYTES
  ) {
    errors.push(`Key slot ${index} has an oversized credential id.`);
    return null;
  }
  return {
    slot_type: slotType,
    credential_id:
      typeof raw.credential_id === "string" ? raw.credential_id : null,
    label: readOptionalString(raw.label) ?? null,
    prf_salt: typeof raw.prf_salt === "string" ? raw.prf_salt : null,
    hkdf_salt: raw.hkdf_salt,
    wrapped_dek: raw.wrapped_dek,
    wrap_iv: raw.wrap_iv,
  };
}

export function validateEnrollPrivateNoteKeysPayload(
  input: unknown
): ValidationResult<EnrollPrivateNoteKeysPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const dekVersion =
    typeof input.dek_version === "number"
      ? input.dek_version
      : Number(input.dek_version);
  if (!Number.isInteger(dekVersion) || dekVersion < 1 || dekVersion > 32767) {
    errors.push("dek_version must be a positive smallint.");
  }

  if (!Array.isArray(input.slots) || input.slots.length === 0) {
    errors.push("At least one unlock method is required.");
    return { ok: false, errors };
  }

  const slots: PrivateNoteKeySlotInput[] = [];
  let recoveryCount = 0;
  input.slots.forEach((raw, index) => {
    const slot = validateKeySlot(raw, index, errors);
    if (slot) {
      slots.push(slot);
      if (slot.slot_type === "recovery") recoveryCount += 1;
    }
  });

  if (recoveryCount === 0) {
    errors.push("A recovery code is required as a backup unlock method.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, value: { dek_version: dekVersion, slots } };
}

// ----- Phase SC.4 (#113) — key-slot lifecycle --------------------------------

export type AddPrivateNoteKeySlotPayload = {
  credential_id: string;
  label: string | null;
  prf_salt: string;
  hkdf_salt: string;
  wrapped_dek: string;
  wrap_iv: string;
};

// Adds a passkey slot (recovery is rotated, not added). Reuses the fixed-length
// rules from the enroll validator.
export function validateAddPrivateNoteKeySlotPayload(
  input: unknown
): ValidationResult<AddPrivateNoteKeySlotPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (
    !isBase64Blob(input.credential_id) ||
    base64ToBytes(input.credential_id).length > MAX_CREDENTIAL_ID_BYTES
  ) {
    errors.push("Passkey credential id is missing or malformed.");
  }
  if (
    !isBase64Blob(input.prf_salt) ||
    !isBase64OfLength(input.prf_salt, PRF_SALT_BYTES)
  ) {
    errors.push("Passkey PRF salt is missing or the wrong size.");
  }
  if (
    !isBase64Blob(input.hkdf_salt) ||
    !isBase64OfLength(input.hkdf_salt, HKDF_SALT_BYTES)
  ) {
    errors.push("HKDF salt is missing or the wrong size.");
  }
  if (
    !isBase64Blob(input.wrapped_dek) ||
    !isBase64OfLength(input.wrapped_dek, WRAPPED_DEK_BYTES)
  ) {
    errors.push("Wrapped key is missing or the wrong size.");
  }
  if (
    !isBase64Blob(input.wrap_iv) ||
    !isBase64OfLength(input.wrap_iv, WRAP_IV_BYTES)
  ) {
    errors.push("Wrap nonce is missing or the wrong size.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      credential_id: input.credential_id as string,
      label: readOptionalString(input.label) ?? null,
      prf_salt: input.prf_salt as string,
      hkdf_salt: input.hkdf_salt as string,
      wrapped_dek: input.wrapped_dek as string,
      wrap_iv: input.wrap_iv as string,
    },
  };
}

export type RotatePrivateNoteRecoveryPayload = {
  hkdf_salt: string;
  wrapped_dek: string;
  wrap_iv: string;
  label: string | null;
};

export function validateRotatePrivateNoteRecoveryPayload(
  input: unknown
): ValidationResult<RotatePrivateNoteRecoveryPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (
    !isBase64Blob(input.hkdf_salt) ||
    !isBase64OfLength(input.hkdf_salt, HKDF_SALT_BYTES)
  ) {
    errors.push("HKDF salt is missing or the wrong size.");
  }
  if (
    !isBase64Blob(input.wrapped_dek) ||
    !isBase64OfLength(input.wrapped_dek, WRAPPED_DEK_BYTES)
  ) {
    errors.push("Wrapped key is missing or the wrong size.");
  }
  if (
    !isBase64Blob(input.wrap_iv) ||
    !isBase64OfLength(input.wrap_iv, WRAP_IV_BYTES)
  ) {
    errors.push("Wrap nonce is missing or the wrong size.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      hkdf_salt: input.hkdf_salt as string,
      wrapped_dek: input.wrapped_dek as string,
      wrap_iv: input.wrap_iv as string,
      label: readOptionalString(input.label) ?? null,
    },
  };
}

export type RemovePrivateNoteKeySlotPayload = {
  slot_id: string;
};

export const validateRemovePrivateNoteKeySlotPayload: (
  input: unknown
) => ValidationResult<RemovePrivateNoteKeySlotPayload> =
  makeIdPayloadValidator("slot_id");
