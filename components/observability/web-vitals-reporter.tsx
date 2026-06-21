"use client";

import { useReportWebVitals } from "next/web-vitals";
import { usePathname } from "next/navigation";

// Client web-vitals reporter (issue #777, workstream 4), mounted once from the
// root layout next to <SpeedInsights/>. It feeds the framework's built-in
// web-vitals hook (Core Web Vitals + Next's custom navigation metrics) to the
// same-origin /api/vitals route, which emits a structured `web_vital` log line
// — giving the log drain route-attributed INP/LCP/FCP/TTFB independent of
// Vercel's small-sample dashboard.
//
// The beacon is same-origin so no CSP change is needed (`connect-src 'self'`
// already covers it). Renders nothing.
export function WebVitalsReporter() {
  const pathname = usePathname();

  useReportWebVitals((metric) => {
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      // Present on Core Web Vitals; undefined for Next's custom metrics, where
      // it serializes away and the route normalizes the absence to null.
      rating: "rating" in metric ? metric.rating : undefined,
      id: metric.id,
      pathname,
    });

    // sendBeacon survives page unload (the common case for INP/LCP, reported on
    // navigation/hide); fall back to a keepalive fetch where it's unavailable.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/vitals", body);
    } else {
      fetch("/api/vitals", { method: "POST", body, keepalive: true }).catch(
        () => {
          // Best-effort telemetry: a dropped beacon is never a user-facing error.
        }
      );
    }
  });

  return null;
}
