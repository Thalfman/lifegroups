// Web-vitals reporting (issue #777, workstream 4). The client reporter
// (`components/observability/web-vitals-reporter.tsx`) beacons a small JSON body
// to `app/api/vitals/route.ts`, which hands the raw text here. This module owns
// the parse/normalize/log so the route handler stays a thin shell and the logic
// is unit-testable without a request — mirroring how `read-timing.ts` keeps its
// logging logic out of the call sites.
//
// PRIVACY: the emitted `web_vital` line carries ONLY the metric name, a rounded
// value, the browser's rating bucket, and a NORMALIZED route. The normalizer
// (`normalizeVitalRoute`) collapses opaque dynamic segments to `:id`, so a
// secret-bearing path like `/invite/<256-bit token>` can never reach the logs —
// invite tokens are bearer secrets stored only as hashes (see
// `lib/shared/invite-token.ts`). It is applied on the client before the beacon
// is sent AND again here as defense-in-depth against a hand-crafted POST.

import { log } from "./logger";

// The browser's web-vitals rating buckets. Next's own custom metrics
// (`Next.js-hydration`, `Next.js-route-change-to-render`, `Next.js-render`)
// carry no rating, so an absent/unknown rating normalizes to null.
const KNOWN_RATINGS = new Set(["good", "needs-improvement", "poor"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A path segment is an opaque dynamic value (id / uuid / bearer token) — not a
// static route name — when it is a UUID, all digits, or a long high-entropy
// string. The length gate plus an uppercase/digit/underscore character class
// catches base64url invite tokens and hex ids while sparing multi-word static
// slugs (e.g. `people-import-template`, `over-shepherds`), which are lowercase
// kebab-case and so never trip the character class.
function isOpaqueSegment(segment: string): boolean {
  if (UUID_RE.test(segment)) return true;
  if (/^\d+$/.test(segment)) return true;
  if (segment.length >= 16 && /[A-Z0-9_]/.test(segment)) return true;
  return false;
}

// Collapse opaque dynamic segments to `:id` so route attribution aggregates
// per-route pattern and never carries a secret-bearing segment. Defensive about
// its input: strips any query/hash (usePathname omits them, a forged POST may
// not) and falls back to "unknown".
export function normalizeVitalRoute(pathname: unknown): string {
  if (typeof pathname !== "string" || pathname.length === 0) return "unknown";
  const path = pathname.split(/[?#]/)[0];
  const normalized = path
    .split("/")
    .map((segment) => (isOpaqueSegment(segment) ? ":id" : segment))
    .join("/");
  return normalized || "unknown";
}

export type WebVitalReport = {
  metric: string;
  value_ms: number;
  rating: string | null;
  route: string;
};

// Parse the raw beacon body into a known, non-private shape. Returns null on
// anything malformed (bad JSON, missing name, non-finite value) so the caller
// silently drops garbage rather than logging noise.
export function parseWebVitalReport(raw: string): WebVitalReport | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const body = parsed as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name : null;
  const value =
    typeof body.value === "number" && Number.isFinite(body.value)
      ? body.value
      : null;
  if (!name || value === null) return null;

  const rating =
    typeof body.rating === "string" && KNOWN_RATINGS.has(body.rating)
      ? body.rating
      : null;

  return {
    metric: name,
    // Round to 2 decimals: integer-ms for the timing metrics (LCP/INP/FCP/TTFB)
    // while preserving CLS's sub-unit precision, keeping one `value_ms` field.
    value_ms: Math.round(value * 100) / 100,
    rating,
    route: normalizeVitalRoute(body.pathname),
  };
}

// Emit one structured `web_vital` info line for a valid report; no-op on a
// malformed body. Fire-and-forget — never throws.
export function logWebVital(raw: string): void {
  const report = parseWebVitalReport(raw);
  if (!report) return;
  log.info({
    event: "web_vital",
    metric: report.metric,
    value_ms: report.value_ms,
    rating: report.rating,
    route: report.route,
  });
}
