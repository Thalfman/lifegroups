// Shared "lift every FormData entry into a plain object" reader used by the
// server-action surfaces whose forms post arbitrary keys (so the runner can't
// use a fixed key list). Two coercion rules exist and must NOT be unified:
//
//   • stringOrUndefined — non-string values (e.g. File) become `undefined`.
//     Used by the calendar/care leader + admin-group actions.
//   • stringified — null values become `undefined`, everything else is
//     String()-coerced. Used by the super-admin invite/clean-slate/delete
//     actions.
//
// Each reader passes through a non-FormData object input unchanged and returns
// {} for anything else, exactly as the per-surface copies did.

function readFormEntries(
  input: unknown,
  coerce: (value: FormDataEntryValue) => unknown
): Record<string, unknown> {
  if (input instanceof FormData) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of input.entries()) {
      out[key] = coerce(value);
    }
    return out;
  }
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

// Non-string entries (File uploads) collapse to `undefined`.
export function readFormPayload(input: unknown): Record<string, unknown> {
  return readFormEntries(input, (value) =>
    typeof value === "string" ? value : undefined
  );
}

// Null entries collapse to `undefined`; every other value is String()-coerced.
export function readFormPayloadStringified(
  input: unknown
): Record<string, unknown> {
  return readFormEntries(input, (value) =>
    value === null ? undefined : String(value)
  );
}
