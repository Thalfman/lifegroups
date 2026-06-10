// Self-service account validation (ADR 0025): pure TypeScript, no I/O. Used
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
