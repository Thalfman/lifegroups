// Phase 5A.0 validation contracts: pure TypeScript, no I/O, no Supabase. Reused by Phase 5A.1 server actions when writes are enabled.

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// At least one digit; allow common phone punctuation; 7–20 chars total.
const PHONE_RE = /^(?=[^\d]*\d)[+0-9().\- ]{7,20}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

// Postgres stores UUIDs lowercase; canonicalize before any equality check
// so case-only variants of an actor's own id cannot bypass self-target guards.
export function normalizeUuid(value: string): string {
  return value.toLowerCase();
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

// ISO date `YYYY-MM-DD`. The RPC takes `date` so we trust the value if
// parseable; this just keeps obviously-malformed input out of the network.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value);
}

// HTML forms post boolean fields as "true" / "false" / "on" / "1" / "0".
// `Boolean(value)` on a non-empty string is always true, so we need an
// explicit parser to keep "false" from accidentally meaning "true".
export function readBooleanFlag(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value === undefined || value === null) return false;
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    return t === "true" || t === "on" || t === "1";
  }
  return false;
}
