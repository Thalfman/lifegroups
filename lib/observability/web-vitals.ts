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
import { ADMIN_ROUTE_REGISTRY } from "@/lib/nav/route-registry";

// The browser's web-vitals rating buckets. Next's own custom metrics
const KNOWN_METRICS = new Set([
  "CLS",
  "FCP",
  "INP",
  "LCP",
  "TTFB",
  "Next.js-hydration",
  "Next.js-route-change-to-render",
  "Next.js-render",
]);
const NON_ADMIN_ROUTE_PATTERNS = [
  "/",
  "/account",
  "/account-deletion",
  "/forgot-password",
  "/invite/[token]",
  "/leader",
  "/leader/[groupId]/calendar",
  "/leader/[groupId]/care",
  "/leader/[groupId]/checkin",
  "/login",
  "/over-shepherd",
  "/over-shepherd/[profileId]",
  "/privacy",
  "/reset-password",
  "/support",
  "/unauthorized",
  "/welcome",
] as const;
const KNOWN_ROUTE_PATTERNS = [
  ...NON_ADMIN_ROUTE_PATTERNS,
  ...ADMIN_ROUTE_REGISTRY.map((entry) => entry.path),
].map((pattern) => pattern.split("/").filter(Boolean));
const MAX_METRIC_VALUE = 300_000;
const MAX_ROUTE_LENGTH = 256;
const MAX_ROUTE_SEGMENTS = 10;
const MAX_ROUTE_SEGMENT_LENGTH = 64;
// (`Next.js-hydration`, `Next.js-route-change-to-render`, `Next.js-render`)
// carry no rating, so an absent/unknown rating normalizes to null.
const KNOWN_RATINGS = new Set(["good", "needs-improvement", "poor"]);

// Match only current route templates and return the fixed template, replacing
// every Next dynamic segment with `:id`. No caller-supplied segment is ever
// emitted. Input bounds and query/hash stripping apply before matching because
// a forged POST need not resemble the value returned by usePathname. Unknown
// route shapes collapse to "unknown".
export function normalizeVitalRoute(pathname: unknown): string {
  if (typeof pathname !== "string" || pathname.length === 0) return "unknown";
  const path = pathname.split(/[?#]/)[0];
  if (
    !path.startsWith("/") ||
    path.length > MAX_ROUTE_LENGTH ||
    /[\\\u0000-\u001f\u007f]/.test(path)
  ) {
    return "unknown";
  }
  if (path === "/") return "/";

  const segments = path.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.length > MAX_ROUTE_SEGMENTS ||
    segments.some((segment) => segment.length > MAX_ROUTE_SEGMENT_LENGTH)
  ) {
    return "unknown";
  }

  for (const patternSegments of KNOWN_ROUTE_PATTERNS) {
    if (patternSegments.length !== segments.length) continue;
    const matches = patternSegments.every(
      (patternSegment, index) =>
        /^\[[^\]]+\]$/.test(patternSegment) ||
        patternSegment === segments[index]
    );
    if (!matches) continue;

    return (
      "/" +
      patternSegments
        .map((segment) => (/^\[[^\]]+\]$/.test(segment) ? ":id" : segment))
        .join("/")
    );
  }

  return "unknown";
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
  if (
    !name ||
    !KNOWN_METRICS.has(name) ||
    value === null ||
    value < 0 ||
    value > MAX_METRIC_VALUE
  ) {
    return null;
  }

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
