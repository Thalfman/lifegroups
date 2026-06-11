// Cross-surface validation primitives. The admin and leader validator sets
// each had a private copy of these; behavior-identical pieces live here so a
// trust-boundary change (e.g. UUID canonicalization) lands in exactly one
// place. Readers whose contracts genuinely differ per surface (optional-string
// null vs. undefined, boolean-flag vocabularies, ISO-date strictness) stay in
// their surface's validation module — see lib/admin/validation/shared.ts and
// lib/leader/validation.ts.

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
