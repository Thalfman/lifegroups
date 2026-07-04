import { cn } from "@/lib/utils";

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

function Bar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-lineSoft", className)}
    />
  );
}

// Tab-row bars keyed by width so the skeleton row reads like the real tab bar.
const TAB_BAR_WIDTHS = [
  "w-[88px]",
  "w-[110px]",
  "w-[84px]",
  "w-[96px]",
  "w-[120px]",
];

export function DetailPageSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Header region — matches PageHeader's padding/maxWidth/margin. */}
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-4 pt-[22px] md:px-10 md:pb-6 md:pt-9">
        <Bar className="mb-3.5 h-[11px] w-[120px] rounded-[6px]" />
        <Bar className="h-10 w-[280px] max-w-[60%] rounded-sm" />
        <Bar className="mt-4 h-3.5 w-[460px] max-w-[90%]" />
      </div>

      {/* Body region — matches PageBody's padding/maxWidth/margin. */}
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-8 md:px-10 md:pb-16">
        {/* Back link */}
        <Bar className="mb-5 h-3.5 w-[110px]" />

        {/* Tab row */}
        <div className="mb-5 flex flex-wrap gap-2.5">
          {TAB_BAR_WIDTHS.map((w) => (
            <Bar key={w} className={cn("h-[30px] rounded-pill", w)} />
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
      <Bar className="h-[220px] rounded-lg" />
      <Bar className="h-40 rounded-lg" />
    </div>
  );
}
