import type { CSSProperties } from "react";

// Shared loading fallbacks for route-level `loading.tsx` boundaries.
//
// `PageSkeleton` mirrors the geometry of PageHeader + PageBody (same outer
// padding / maxWidth / margin) so the skeleton occupies the same box the real
// page will, and the content area doesn't jump when the server render streams
// in. It's the right shape for the admin and over-shepherd surfaces, which both
// render inside LgAppShell with PageHeader/PageBody.
//
// `SimplePageSkeleton` is a neutral, shell-agnostic fallback for the leader
// surface, which uses a different shell (PastoralAppShell) and a minimal,
// form/calendar-shaped layout — the admin dashboard skeleton would be
// misleading there.
//
// Both are wrapped in role="status" with an sr-only "Loading…" so assistive
// tech announces the transition (the visual bars are aria-hidden), matching the
// role="status" convention already used elsewhere in the app.

const PULSE = "pulse 1.5s ease-in-out infinite";

function Bar({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={{
        background: "var(--c-lineSoft)",
        borderRadius: 8,
        animation: PULSE,
        ...style,
      }}
    />
  );
}

export function PageSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Header region — matches PageHeader's padding/maxWidth/margin. */}
      <div
        className="lg-shell-pageheader"
        style={{
          padding: "36px 40px 24px",
          maxWidth: 1240,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <Bar
          style={{ height: 11, width: 120, borderRadius: 6, marginBottom: 14 }}
        />
        <Bar
          style={{ height: 40, width: 320, maxWidth: "70%", borderRadius: 10 }}
        />
        <Bar
          style={{ height: 14, width: 440, maxWidth: "90%", marginTop: 16 }}
        />
      </div>

      {/* Body region — matches PageBody's padding/maxWidth/margin. */}
      <div
        className="lg-shell-pagebody"
        style={{
          padding: "0 40px 64px",
          maxWidth: 1240,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} style={{ height: 96, borderRadius: 14 }} />
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Bar style={{ height: 180, borderRadius: 14 }} />
          <Bar style={{ height: 240, borderRadius: 14 }} />
        </div>
      </div>
    </div>
  );
}

export function SimplePageSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div
        style={{
          padding: "32px 24px 64px",
          maxWidth: 720,
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <Bar
          style={{ height: 32, width: 240, maxWidth: "70%", borderRadius: 10 }}
        />
        <Bar style={{ height: 200, borderRadius: 14 }} />
        <Bar style={{ height: 120, borderRadius: 14 }} />
      </div>
    </div>
  );
}
