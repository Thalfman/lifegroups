// Client error-boundary reporting (#861). The error boundaries beacon a small
// JSON body to `app/api/client-error/route.ts`, which hands the raw text here.
// This module owns the parse/normalize/log so the route handler stays a thin
// shell and the logic is unit-testable without a request — the same split as
// `web-vitals.ts`, whose route normalizer it reuses.
//
// PRIVACY: the emitted `client_error` line carries ONLY the error's name, a
// truncated message, Next's opaque digest, and a NORMALIZED route. No stack
// trace and no form/user data ever reach the drain: the boundary sends only
// these fields, and a hand-crafted POST is re-validated and truncated here.

import { log } from "./logger";
import { normalizeVitalRoute } from "./web-vitals";

// Bounds for a fire-and-forget diagnostic beacon: enough to identify the
// failure class, small enough that a hostile POST can't stuff the drain.
const MAX_RAW_LENGTH = 2048;
const MAX_NAME_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 300;
const MAX_DIGEST_LENGTH = 100;

export type ClientErrorReport = {
  error_name: string;
  error_message: string;
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

  const message = typeof body.message === "string" ? body.message : "";
  const digest =
    typeof body.digest === "string" && body.digest.length > 0
      ? body.digest.slice(0, MAX_DIGEST_LENGTH)
      : null;

  return {
    error_name: name.slice(0, MAX_NAME_LENGTH),
    error_message: message.slice(0, MAX_MESSAGE_LENGTH),
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
    error_message: report.error_message,
    digest: report.digest,
    route: report.route,
  });
}
