// Pivot slice 11 (#382 / ADR 0020) validation contract for a leader's
// group-scoped Care Note / Prayer Request. Pure TypeScript, no I/O. Used by the
// server action before it hits the RPC boundary; the SECURITY DEFINER RPC
// re-validates everything at the database layer (it is the real trust boundary).

import { isUuid } from "@/lib/shared/uuid";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

// Generous-but-bounded body length; the RPC enforces the same 4000-char ceiling.
const NOTE_BODY_MAX = 4000;

export type LeaderGroupNotePayload = {
  group_id: string;
  body: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function validateGroupNotePayload(
  input: unknown,
  noun: string
): ValidationResult<LeaderGroupNotePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["The note payload was malformed."] };

  const errors: string[] = [];

  if (!isUuid(input.group_id)) {
    errors.push("group_id must be a uuid");
  }

  const body = trimString(input.body);
  if (body === null) {
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
      group_id: (input.group_id as string).toLowerCase(),
      body: body as string,
    },
  };
}

export function validateLeaderGroupCareNotePayload(
  input: unknown
): ValidationResult<LeaderGroupNotePayload> {
  return validateGroupNotePayload(input, "care note");
}

export function validateLeaderGroupPrayerRequestPayload(
  input: unknown
): ValidationResult<LeaderGroupNotePayload> {
  return validateGroupNotePayload(input, "prayer request");
}
