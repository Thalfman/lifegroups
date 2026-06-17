"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { P } from "@/lib/pastoral";

// The Multiply area's three tab panels are its heaviest client components
// (multiplication planner ~953 lines, leader pipeline ~467, readiness grid
// ~295). Only one tab is visible at a time, and the panels carry no first-paint
// content the hero doesn't already convey, so loading them with ssr:false moves
// their code off this route's First Load JS into chunks fetched after hydration
// — the same pattern the launch-planning surface uses (see
// launch-planning/lazy-panels.tsx). A lightweight skeleton covers the brief gap
// before a chunk arrives; the swap follows a click, so it doesn't count toward
// CLS.

const skeletonStyle: CSSProperties = {
  minHeight: 320,
  borderRadius: 14,
  border: `1px solid ${P.line}`,
  background: `linear-gradient(90deg, ${P.surface} 0%, ${P.bgDeep} 50%, ${P.surface} 100%)`,
  backgroundSize: "200% 100%",
  animation: "lg-panel-shimmer 1.2s ease-in-out infinite",
};

function PanelSkeleton({ label }: { label: string }) {
  return (
    <>
      <style>{`@keyframes lg-panel-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <div
        role="status"
        aria-label={`Loading ${label}`}
        style={skeletonStyle}
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
