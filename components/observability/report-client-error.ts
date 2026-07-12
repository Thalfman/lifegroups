// Beacon an error caught by a client error boundary to the same-origin
// /api/client-error sink (#861), so production render failures reach the
// structured log drain instead of dying in the user's console. Same posture
// as the web-vitals reporter: same-origin (no CSP change), keepalive so the
// POST survives an unload, no-referrer so a secret-bearing page URL never
// reaches access logs, and strictly best-effort — a dropped beacon is never a
// user-facing error.
//
// Only non-private fields leave the page: error class, Next's opaque digest,
// and the pathname (normalized again server-side before logging). Error
// messages and stacks never cross the boundary.

export function reportClientError(
  error: Error & { digest?: string },
  pathname: string
): void {
  try {
    const body = JSON.stringify({
      name: error.name,
      digest: error.digest,
      pathname,
    });
    // Deliberately fetch, NOT sendBeacon: keepalive gives the same
    // survives-unload guarantee, but sendBeacon cannot set a referrer policy —
    // under the global strict-origin-when-cross-origin header a same-origin
    // beacon would carry the full crashing page's path (possibly
    // /invite/<token>) in the Referer to access logs. Same rationale as the
    // web-vitals reporter.
    fetch("/api/client-error", {
      method: "POST",
      body,
      keepalive: true,
      referrerPolicy: "no-referrer",
    }).catch(() => {
      // Best-effort telemetry.
    });
  } catch {
    // Reporting must never crash the error boundary that is doing the reporting.
  }
}
