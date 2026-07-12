// Client error-boundary reporting (#861). The error boundaries beacon a small
// JSON body to `app/api/client-error/route.ts`, which hands the raw text here.
// This module owns the parse/normalize/log so the route handler stays a thin
// shell and the logic is unit-testable without a request — the same split as
// `web-vitals.ts`, whose route normalizer it reuses.
//
// PRIVACY: the emitted `client_error` line carries ONLY an allowlisted error
// class, Next's bounded opaque digest, and a NORMALIZED route. Messages and
// stacks are discarded even when a hand-crafted POST includes them because
// either may contain user-entered or otherwise private data.

import { log } from "./logger";
import { normalizeVitalRoute } from "./web-vitals";

// Bounds for a fire-and-forget diagnostic beacon: enough to identify the
// failure class, small enough that a hostile POST can't stuff the drain.
const MAX_RAW_LENGTH = 2048;
const MAX_DIGEST_LENGTH = 100;
const KNOWN_ERROR_NAMES = new Set([
  "AggregateError",
  "ChunkLoadError",
  "Error",
  "NotFoundError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);
const OPAQUE_DIGEST_RE = /^[A-Za-z0-9_-]+$/;

export type ClientErrorReport = {
  error_name: string;
  digest: string | null;
  route: string;
};

// Parse the raw beacon body into a known, non-private shape. Returns null on
// anything malformed (oversized body, bad JSON, missing name) so the caller
// silently drops garbage rather than logging noise.
export function parseClientErrorReport(raw: string): ClientErrorReport | null {
  if (raw.length > MAX_RAW_LENGTH) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const body = parsed as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return null;

  const errorName = KNOWN_ERROR_NAMES.has(name) ? name : "Error";
  const digest =
    typeof body.digest === "string" &&
    body.digest.length > 0 &&
    body.digest.length <= MAX_DIGEST_LENGTH &&
    OPAQUE_DIGEST_RE.test(body.digest)
      ? body.digest
      : null;

  return {
    error_name: errorName,
    digest,
    route: normalizeVitalRoute(body.pathname),
  };
}

// Emit one structured `client_error` error line for a valid report; no-op on a
// malformed body. Fire-and-forget — never throws.
export function logClientError(raw: string): void {
  const report = parseClientErrorReport(raw);
  if (!report) return;
  log.error({
    event: "client_error",
    outcome: "fail",
    error_name: report.error_name,
    digest: report.digest,
    route: report.route,
  });
}
