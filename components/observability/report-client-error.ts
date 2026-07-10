// Beacon an error caught by a client error boundary to the same-origin
// /api/client-error sink (#861), so production render failures reach the
// structured log drain instead of dying in the user's console. Same posture
// as the web-vitals reporter: same-origin (no CSP change), keepalive so the
// POST survives an unload, no-referrer so a secret-bearing page URL never
// reaches access logs, and strictly best-effort — a dropped beacon is never a
// user-facing error.
//
// Only non-private fields leave the page: error name, a truncated message,
// Next's opaque digest, and the pathname (normalized again server-side before
// logging). Never the stack.

export function reportClientError(
  error: Error & { digest?: string },
  pathname: string
): void {
  try {
    const body = JSON.stringify({
      name: error.name,
      message: String(error.message ?? "").slice(0, 300),
      digest: error.digest,
      pathname,
    });
    // sendBeacon survives page teardown without keeping the page alive; fall
    // back to a keepalive fetch where it's unavailable.
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      navigator.sendBeacon("/api/client-error", body);
      return;
    }
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
