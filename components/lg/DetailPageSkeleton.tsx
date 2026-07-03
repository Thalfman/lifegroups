import type { CSSProperties } from "react";

// Loading fallback for the data-heavy detail routes' `loading.tsx` boundaries
// (repo-sweep #589). The generic PageSkeleton is shaped like a list/dashboard
// (a row of stat cards), which mis-shapes a detail/editor page and causes a
// visible jump when the real content streams in. This variant matches the
// detail layout instead — PageHeader, a back link, a row of tabs, then a tall
// content card — so navigating to a group / person / leader-care detail commits
// to a skeleton the same shape as the page that replaces it.
//
// Geometry mirrors PageHeader + PageBody (same padding / maxWidth / margin),
// matching PageSkeleton's approach. Wrapped in role="status" with an sr-only
// "Loading…" so assistive tech announces the transition.

function Bar({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-md bg-lineSoft"
      style={style}
    />
  );
}

export function DetailPageSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Header region — matches PageHeader's padding/maxWidth/margin. */}
      <div
        className="mx-auto w-full px-4 pb-4 pt-[22px] md:px-10 md:pb-6 md:pt-9"
        style={{ maxWidth: 1240 }}
      >
        <Bar
          style={{ height: 11, width: 120, borderRadius: 6, marginBottom: 14 }}
        />
        <Bar
          style={{ height: 40, width: 280, maxWidth: "60%", borderRadius: 10 }}
        />
        <Bar
          style={{ height: 14, width: 460, maxWidth: "90%", marginTop: 16 }}
        />
      </div>

      {/* Body region — matches PageBody's padding/maxWidth/margin. */}
      <div
        className="mx-auto w-full px-4 pb-8 md:px-10 md:pb-16"
        style={{ maxWidth: 1240 }}
      >
        {/* Back link */}
        <Bar style={{ height: 14, width: 110, marginBottom: 20 }} />

        {/* Tab row */}
        <div className="mb-5 flex flex-wrap gap-2.5">
          {[88, 110, 84, 96, 120].map((w) => (
            <Bar key={w} style={{ height: 30, width: w, borderRadius: 9999 }} />
          ))}
        </div>

        {/* Active tab panel — a tall card. */}
        <DetailTabPanelSkeleton />
      </div>
    </div>
  );
}

// Just the active-tab panel (the tall content card), for an in-page Suspense
// boundary where the PageHeader + tab bar have already painted and only the
// streamed tab content is still loading (repo-sweep #605). Wrapped in
// role="status" so the streamed-in transition is announced.
export function DetailTabPanelSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Loading…</span>
      <Bar style={{ height: 220, borderRadius: 14 }} />
      <Bar style={{ height: 160, borderRadius: 14 }} />
    </div>
  );
}
