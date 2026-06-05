import { isUuid } from "@/lib/shared/uuid";
import type { ValidationResult } from "./shared";
import { isRecord, trimString, normalizeUuid, readBooleanFlag } from "./shared";

// ---------------------------------------------------------------------------
// Pivot slice 9 (#381 / ADR 0017) — Care Notes + Prayer Requests + the
// per-subject transparency toggle payloads.
// ---------------------------------------------------------------------------
// Author-private notes about a subject person. The body is bounded; the RPC
// re-checks (it is the DB trust boundary). The transparency toggle payload is a
// subject id + a boolean grant. DISTINCT from the SC.4 encrypted private note
// (no ciphertext / key material here — the body is plain text).

// Generous-but-bounded body length; the RPC enforces the same 4000-char ceiling.
const NOTE_BODY_MAX = 4000;

export type WriteCareNotePayload = {
  subject_profile_id: string;
  body: string;
};

function validateNoteWritePayload(
  input: unknown,
  noun: string
): ValidationResult<WriteCareNotePayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.subject_profile_id)) {
    errors.push("subject_profile_id must be a uuid");
  }

  const body = trimString(input.body);
  if (body === null || body.length === 0) {
    errors.push(`A ${noun} is required.`);
  } else if (body.length > NOTE_BODY_MAX) {
    errors.push(
      `${noun[0].toUpperCase()}${noun.slice(1)} is too long (max ${NOTE_BODY_MAX} characters).`
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      subject_profile_id: normalizeUuid(input.subject_profile_id as string),
      body: body as string,
    },
  };
}

export function validateWriteCareNotePayload(
  input: unknown
): ValidationResult<WriteCareNotePayload> {
  return validateNoteWritePayload(input, "care note");
}

export type WritePrayerRequestPayload = WriteCareNotePayload;

export function validateWritePrayerRequestPayload(
  input: unknown
): ValidationResult<WritePrayerRequestPayload> {
  return validateNoteWritePayload(input, "prayer request");
}

export type SetNoteTransparencyGrantPayload = {
  subject_profile_id: string;
  granted: boolean;
};

export function validateSetNoteTransparencyGrantPayload(
  input: unknown
): ValidationResult<SetNoteTransparencyGrantPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.subject_profile_id)) {
    errors.push("subject_profile_id must be a uuid");
  }

  const granted = readBooleanFlag(input.granted);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      subject_profile_id: normalizeUuid(input.subject_profile_id as string),
      granted,
    },
  };
}
