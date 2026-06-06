// Trust-boundary decode primitives for stored jsonb config. No I/O.
//
// Settings rows (and other jsonb payloads) come back as `unknown`-shaped
// records; every read path needs the same "read this field as a finite number,
// fall back when it's absent or garbage" rule. That rule was copied across
// lib/admin/metrics.ts, lib/admin/launch-planning.ts, and lib/admin/group-health.ts
// — byte-for-byte in two of them — so it lived in three places and could drift.
//
// This is the one home for it. The int-vs-number distinction (cut-lines and
// weights may be fractional; counts and thresholds must be whole) is an explicit
// choice of function name here, not an accident of which module you opened.
//
// `source` accepts null/undefined so callers can pass a possibly-absent decoded
// record directly; a missing source always yields the fallback.

type JsonSource = Record<string, unknown> | null | undefined;

// Read `key` as a finite integer, or `fallback` when absent/non-finite/non-integer.
export function jsonInt(
  source: JsonSource,
  key: string,
  fallback: number
): number {
  if (!source) return fallback;
  const raw = source[key];
  if (typeof raw === "number" && Number.isFinite(raw) && Number.isInteger(raw))
    return raw;
  return fallback;
}

// Like jsonInt, but an explicit stored `null` resolves to null (a deliberately
// unset value, distinct from "absent ⇒ fallback").
export function jsonIntOrNull(
  source: JsonSource,
  key: string,
  fallback: number | null
): number | null {
  if (!source) return fallback;
  const raw = source[key];
  if (raw === null) return null;
  if (typeof raw === "number" && Number.isFinite(raw) && Number.isInteger(raw))
    return raw;
  return fallback;
}

// Read `key` as a finite number (integers or fractions), or `fallback` when
// absent/non-finite. Used for tunable cut-lines, weights, and percentages that
// may legitimately be fractional.
export function jsonNumber(
  source: JsonSource,
  key: string,
  fallback: number
): number {
  if (!source) return fallback;
  const raw = source[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return fallback;
}
