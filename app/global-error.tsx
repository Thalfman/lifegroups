"use client";

import { useEffect } from "react";

// Top-level error boundary (#559). global-error replaces the root layout, so it
// renders its own <html>/<body> and cannot rely on the app's global CSS — the
// branding here is inline so an installed PWA / native shell still shows an
// app-like screen with a retry path rather than a bare browser error.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // Beacon the failure to the structured log drain (#861). global-error
    // renders when the root layout itself failed, so this stays inline and
    // dependency-free (no app imports, window.location over usePathname) —
    // the fewer modules this boundary pulls in, the less can take it down too.
    // fetch, NOT sendBeacon: sendBeacon cannot set a referrer policy, and the
    // crashing page's path (possibly a secret-bearing /invite/<token>) must
    // never reach access logs via the Referer.
    try {
      const body = JSON.stringify({
        name: error.name,
        message: String(error.message ?? "").slice(0, 300),
        digest: error.digest,
        pathname: window.location.pathname,
      });
      fetch("/api/client-error", {
        method: "POST",
        body,
        keepalive: true,
        referrerPolicy: "no-referrer",
      }).catch(() => {});
    } catch {
      // Reporting must never crash the last-resort boundary.
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#fbfaf4",
          color: "#2c2722",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <main style={{ maxWidth: 440, textAlign: "center" }}>
          <div
            aria-hidden="true"
            style={{
              width: 44,
              height: 44,
              margin: "0 auto 20px",
              borderRadius: "9999px",
              background: "#a8512f",
              color: "#fbfaf4",
              display: "grid",
              placeItems: "center",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 1,
            }}
          >
            FVC
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 500 }}>
            Something went wrong
          </h1>
          <p
            style={{
              margin: "0 0 24px",
              fontSize: 16,
              lineHeight: 1.5,
              color: "#6b6359",
            }}
          >
            The app hit an unexpected error. Please try again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              appearance: "none",
              cursor: "pointer",
              border: "1px solid #a8512f",
              borderRadius: 8,
              background: "#a8512f",
              color: "#fbfaf4",
              padding: "10px 18px",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
