// Phase 5A.0 validation contracts: pure TypeScript, no I/O, no Supabase. Reused by Phase 5A.1 server actions when writes are enabled.

import { isUuid } from "@/lib/shared/uuid";
import {
  isRecord,
  makeBooleanFlagReader,
  normalizeUuid,
  type ValidationResult,
} from "@/lib/shared/validation-primitives";

export {
  isRecord,
  normalizeUuid,
  type ValidationResult,
} from "@/lib/shared/validation-primitives";

// The single-uuid-id payload was the most-copied validator shape in this
// layer: reject a non-object, reject a missing/malformed uuid, otherwise return
// the canonicalized id under its field name. `makeIdPayloadValidator(field)`
// builds exactly that validator so each surface keeps its own exported name and
// payload type while the body lives here once.
export function makeIdPayloadValidator<F extends string>(
  fieldName: F
): (input: unknown) => ValidationResult<Record<F, string>> {
  return (input) => {
    if (!isRecord(input))
      return { ok: false, errors: ["payload must be an object"] };
    const value = input[fieldName];
    if (!isUuid(value))
      return { ok: false, errors: [`${fieldName} must be a uuid`] };
    return {
      ok: true,
      value: { [fieldName]: normalizeUuid(value) } as Record<F, string>,
    };
  };
}

// The "optional uuid field" micro-pattern: a form posts "" for an absent select,
// which `readOptionalString` collapses to undefined (= leave unset). A present
// value must be a uuid; on failure push `message` and return null, otherwise
// return the canonicalized id. Returns undefined when the field is absent so the
// caller can keep its "leave unset" branch.
export function readOptionalUuid(
  value: unknown,
  errors: string[],
  message: string
): string | null | undefined {
  const raw = readOptionalString(value);
  if (raw === undefined) return undefined;
  if (!isUuid(raw)) {
    errors.push(message);
    return null;
  }
  return normalizeUuid(raw);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// At least one digit; allow common phone punctuation; 7–20 chars total.
const PHONE_RE = /^(?=[^\d]*\d)[+0-9().\- ]{7,20}$/;

export function trimString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

// Forms post empty optional inputs as "". Treat empty / whitespace-only as absent.
export function readOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = trimString(value);
  if (trimmed === null) return undefined;
  return trimmed.length === 0 ? undefined : trimmed;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

export function isPhone(value: string): boolean {
  return PHONE_RE.test(value);
}

export function readOptionalInteger(
  value: unknown
): number | undefined | "invalid" {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return "invalid";
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    if (!/^-?\d+$/.test(trimmed)) return "invalid";
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : "invalid";
  }
  return "invalid";
}

// ISO date `YYYY-MM-DD`, verified against the real calendar. Format alone let
// impossible dates (2026-02-30, 2026-13-01) through to the RPC's Postgres
// `date` cast, which rejected them with the generic rpc-error fallback instead
// of a friendly validation message. The round-trip check mirrors the
// launch-planning and calendar validators (isRealIsoDate).
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip: 2026-02-30 parses as 2026-03-02, so it fails the compare.
  return d.toISOString().slice(0, 10) === value;
}

// The admin boolean-flag vocabulary. Shared mechanics live in
// makeBooleanFlagReader; the leader surface's reader additionally accepts
// "yes" (a tested per-surface contract — don't merge the vocabularies).
export const readBooleanFlag = makeBooleanFlagReader(["true", "on", "1"]);

// Pure UTC "today" so a near-midnight server time doesn't flip a
// future-date guard for a date the admin entered moments ago. Shared by the
// shepherd-care interaction and over-shepherd coverage validators.
export function todayIsoUtc(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
}
