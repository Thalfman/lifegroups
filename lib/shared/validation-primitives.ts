// Cross-surface validation primitives. The admin and leader validator sets
// each had a private copy of these; behavior-identical pieces live here so a
// trust-boundary change (e.g. UUID canonicalization) lands in exactly one
// place. Readers whose contracts genuinely differ per surface (optional-string
// null vs. undefined, ISO-date strictness) stay in their surface's validation
// module — see lib/admin/validation/shared.ts and lib/leader/validation.ts.
// Boolean-flag vocabularies also stay per-surface (the leader form accepts
// "yes"; admin surfaces don't), but the reader mechanics are shared via
// makeBooleanFlagReader so only the accepted set differs.

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Postgres stores UUIDs lowercase; canonicalize before any equality check
// so case-only variants of an actor's own id cannot bypass self-target guards.
export function normalizeUuid(value: string): string {
  return value.toLowerCase();
}

// HTML forms post boolean fields as "true" / "false" / "on" / "1" / "0".
// `Boolean(value)` on a non-empty string is always true, so an explicit parser
// keeps "false" from accidentally meaning "true". Each surface declares its
// accepted truthy vocabulary; everything else (including boolean `false`,
// null, undefined, and non-strings) reads false.
export function makeBooleanFlagReader(
  truthy: readonly string[]
): (value: unknown) => boolean {
  const accepted = new Set(truthy);
  return (value: unknown): boolean => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string")
      return accepted.has(value.trim().toLowerCase());
    return false;
  };
}
