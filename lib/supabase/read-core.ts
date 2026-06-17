import type { AppSupabaseClient } from "./types";

export type ReadClient = AppSupabaseClient;

export type ReadResult<T> =
  | { data: T; error: null }
  | { data: null; error: Error };

export function wrapError(prefix: string, err: unknown): Error {
  if (err instanceof Error) return new Error(`${prefix}: ${err.message}`);
  return new Error(`${prefix}: ${String(err)}`);
}

/**
 * UTC-anchored YYYY-MM-DD string for "today", used by every shepherd-care
 * read/composition path so date math (stale window, overdue touchpoints,
 * upcoming window) stays consistent across server timezones.
 */
export function currentUtcDateIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Decode a raw jsonb object (e.g. a grade row's `criterion_scores`) into a
 * clean `Record<string, number>` at the trust boundary, dropping any
 * non-finite or non-numeric value. Used by the Care / leader / multiplication
 * grade readers so the criterion-score decode lives in one place.
 */
export function decodeNumericRecord(raw: unknown): Record<string, number> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

export function differenceInDaysIso(today: string, then: string): number {
  // Both inputs are YYYY-MM-DD; Date.parse with the ISO string at midnight UTC
  // is stable across server timezones. Truncate the result to whole days.
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${then}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.floor((a - b) / 86_400_000);
}
