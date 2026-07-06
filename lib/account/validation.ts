// Self-service account validation (ADR 0032): pure TypeScript, no I/O. Used
// by the /reset-password and /welcome actions before calling
// set_own_full_name; the RPC re-validates server-side as the security
// boundary. Shape mirrors lib/admin/validation/shared.ts without importing
// the admin surface into the account one.

export type OwnFullNameResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

// Matches the char_length(v_name) > 200 cap in set_own_full_name.
const MAX_FULL_NAME_LENGTH = 200;

export function validateOwnFullName(input: unknown): OwnFullNameResult {
  if (typeof input !== "string") {
    return { ok: false, error: "Enter your name." };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Enter your name." };
  }
  if (trimmed.length > MAX_FULL_NAME_LENGTH) {
    return {
      ok: false,
      error: `Name is too long (${MAX_FULL_NAME_LENGTH} characters max).`,
    };
  }
  return { ok: true, value: trimmed };
}

// Optional free-text reason on an account-deletion request (#563). Empty /
// missing is allowed (returns null); a present value is trimmed and capped to
// match the char_length(...) <= 1000 check in request_own_account_deletion.
export type DeletionReasonResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

const MAX_DELETION_REASON_LENGTH = 1000;

// Full account-deletion request payload: the explicit confirmation checkbox
// (so a stray submit can't archive an account) plus the optional reason.
export type DeletionRequestResult =
  | { ok: true; value: { reason: string | null } }
  | { ok: false; errors: string[] };

export function validateDeletionRequest(
  raw: Record<string, unknown>
): DeletionRequestResult {
  if (raw.confirm !== "on") {
    return {
      ok: false,
      errors: ["Please confirm you understand before requesting deletion."],
    };
  }
  const reason = validateDeletionReason(raw.reason);
  if (!reason.ok) return { ok: false, errors: [reason.error] };
  return { ok: true, value: { reason: reason.value } };
}

export function validateDeletionReason(input: unknown): DeletionReasonResult {
  if (input === null || input === undefined) {
    return { ok: true, value: null };
  }
  if (typeof input !== "string") {
    return { ok: false, error: "Enter a valid reason." };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }
  if (trimmed.length > MAX_DELETION_REASON_LENGTH) {
    return {
      ok: false,
      error: `Reason is too long (${MAX_DELETION_REASON_LENGTH} characters max).`,
    };
  }
  return { ok: true, value: trimmed };
}
