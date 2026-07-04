import { cn } from "@/lib/utils";

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

function Bar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-lineSoft", className)}
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
        <div className="mx-auto w-full max-w-[1240px] px-4 pb-4 pt-[22px] md:px-10 md:pb-6 md:pt-9">
          <Bar className="mb-3.5 h-[11px] w-[120px] rounded-[6px]" />
          <Bar className="h-10 w-80 max-w-[70%] rounded-sm" />
          <Bar className="mt-4 h-3.5 w-[440px] max-w-[90%]" />
        </div>
      )}

      {/* Body region — matches PageBody's padding/maxWidth/margin. */}
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-8 md:px-10 md:pb-16">
        <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} className="h-24 rounded-lg" />
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <Bar className="h-[180px] rounded-lg" />
          <Bar className="h-60 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
