"use client";

import dynamic from "next/dynamic";

// The Multiply area's three tab panels are its heaviest client components
// (multiplication planner ~953 lines, leader pipeline ~467, readiness grid
// ~295). Only one tab is visible at a time, and the panels carry no first-paint
// content the hero doesn't already convey, so loading them with ssr:false moves
// their code off this route's First Load JS into chunks fetched after hydration
// — the same pattern the launch-planning surface uses (see
// launch-planning/lazy-panels.tsx). A lightweight skeleton covers the brief gap
// before a chunk arrives; the swap follows a click, so it doesn't count toward
// CLS.

// The shimmer gradient composes the raw --c-* palette vars (surface → sidebar
// → surface) because Tailwind has no token for a multi-stop gradient.
const skeletonClassName =
  "min-h-80 animate-[lg-panel-shimmer_1.2s_ease-in-out_infinite] rounded-lg border border-line bg-[linear-gradient(90deg,var(--c-surface)_0%,var(--c-sidebar)_50%,var(--c-surface)_100%)] bg-[length:200%_100%]";

function PanelSkeleton({ label }: { label: string }) {
  return (
    <>
      <style>{`@keyframes lg-panel-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <div
        role="status"
        aria-label={`Loading ${label}`}
        className={skeletonClassName}
      />
    </>
  );
}

export const MultiplicationPlanner = dynamic(
  () =>
    import("@/components/admin/multiplication/multiplication-planner").then(
      (m) => m.MultiplicationPlanner
    ),
  { ssr: false, loading: () => <PanelSkeleton label="multiplication plan" /> }
);

export const MultiplyGridView = dynamic(
  () =>
    import("@/components/admin/multiply/multiply-grid").then(
      (m) => m.MultiplyGridView
    ),
  { ssr: false, loading: () => <PanelSkeleton label="readiness grid" /> }
);

export const LeaderPipeline = dynamic(
  () =>
    import("@/components/admin/leader-pipeline/leader-pipeline").then(
      (m) => m.LeaderPipeline
    ),
  { ssr: false, loading: () => <PanelSkeleton label="leader pipeline" /> }
);
