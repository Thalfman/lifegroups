import type { CSSProperties } from "react";

// Loading fallback for the admin `loading.tsx` boundary. It mirrors the
// geometry of PageHeader + PageBody (same outer padding / maxWidth / margin) so
// the skeleton occupies the same box the real page will, and the content area
// doesn't jump when the server render streams in. Only the admin tier renders
// its shell (LgAppShell) in the layout — above the Suspense boundary — so the
// sidebar/topbar persist and this fills just the main content region.
//
// `bodyOnly` drops the header bars: a page that streams its data behind an
// in-page <Suspense> renders the REAL PageHeader synchronously (outside the
// boundary) and uses this as the body fallback, so a header skeleton would
// double up under the real header. The default (full skeleton) stays the
// `loading.tsx` route fallback, where no header has rendered yet.
//
// Wrapped in role="status" with an sr-only "Loading…" so assistive tech
// announces the transition (the visual bars are aria-hidden), matching the
// role="status" convention already used elsewhere in the app.

function Bar({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-md bg-lineSoft"
      style={style}
    />
  );
}

export function PageSkeleton({
  bodyOnly = false,
}: { bodyOnly?: boolean } = {}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Header region — matches PageHeader's padding/maxWidth/margin. Skipped
          when the real PageHeader has already rendered above the boundary. */}
      {bodyOnly ? null : (
        <div
          className="mx-auto w-full px-4 pb-4 pt-[22px] md:px-10 md:pb-6 md:pt-9"
          style={{ maxWidth: 1240 }}
        >
          <Bar
            style={{
              height: 11,
              width: 120,
              borderRadius: 6,
              marginBottom: 14,
            }}
          />
          <Bar
            style={{
              height: 40,
              width: 320,
              maxWidth: "70%",
              borderRadius: 10,
            }}
          />
          <Bar
            style={{ height: 14, width: 440, maxWidth: "90%", marginTop: 16 }}
          />
        </div>
      )}

      {/* Body region — matches PageBody's padding/maxWidth/margin. */}
      <div
        className="mx-auto w-full px-4 pb-8 md:px-10 md:pb-16"
        style={{ maxWidth: 1240 }}
      >
        <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} style={{ height: 96, borderRadius: 14 }} />
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <Bar style={{ height: 180, borderRadius: 14 }} />
          <Bar style={{ height: 240, borderRadius: 14 }} />
        </div>
      </div>
    </div>
  );
}
