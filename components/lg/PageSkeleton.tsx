import type { CSSProperties } from "react";

// Shared loading fallback for route-level `loading.tsx` boundaries. It mirrors
// the geometry of PageHeader + PageBody (same outer padding / maxWidth / margin)
// so the skeleton occupies the same box the real page will, and the content area
// doesn't jump when the server render streams in. The persistent app shell
// (sidebar + topbar) lives above the Suspense boundary, so this only fills the
// main content region.

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
    <div aria-hidden="true">
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
