"use client";

import { useCallback, useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { usePathname } from "next/navigation";
import { normalizeVitalRoute } from "@/lib/observability/web-vitals";

// Client web-vitals reporter (issue #777, workstream 4), mounted once from the
// root layout next to <SpeedInsights/>. It feeds the framework's built-in
// web-vitals hook (Core Web Vitals + Next's custom navigation metrics) to the
// same-origin /api/vitals route, which emits a structured `web_vital` log line
// — giving the log drain route-attributed INP/LCP/FCP/TTFB independent of
// Vercel's small-sample dashboard.
//
// The beacon is same-origin so no CSP change is needed (`connect-src 'self'`
// already covers it). The route is normalized before sending so a secret-bearing
// path (e.g. `/invite/<token>`) never leaves the page. Renders nothing.
export function WebVitalsReporter() {
  const pathname = usePathname();

  // Hold the live route in a ref so the reporter callback can stay stable. A
  // fresh callback identity each render would make `useReportWebVitals` treat it
  // as a new reporter and could re-emit already-collected metrics on navigation,
  // duplicating `web_vital` lines and skewing before/after comparisons.
  const routeRef = useRef(pathname);
  useEffect(() => {
    routeRef.current = pathname;
  }, [pathname]);

  const report = useCallback(
    (metric: { name: string; value: number; id: string; rating?: string }) => {
      const body = JSON.stringify({
        name: metric.name,
        value: metric.value,
        // Present on Core Web Vitals; undefined for Next's custom metrics, where
        // it serializes away and the route normalizes the absence to null.
        rating: metric.rating,
        id: metric.id,
        pathname: normalizeVitalRoute(routeRef.current),
      });

      // sendBeacon survives page unload (the common case for INP/LCP, reported on
      // navigation/hide). It can also return false when the user agent refuses to
      // queue the request — fall back to a keepalive fetch so the sample isn't
      // silently dropped.
      const queued =
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function" &&
        navigator.sendBeacon("/api/vitals", body);

      if (!queued) {
        fetch("/api/vitals", { method: "POST", body, keepalive: true }).catch(
          () => {
            // Best-effort telemetry: a dropped beacon is never a user-facing error.
          }
        );
      }
    },
    []
  );

  useReportWebVitals(report);

  return null;
}
