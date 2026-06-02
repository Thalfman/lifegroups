"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { P } from "@/lib/pastoral";

// The launch-planning surface opens with NO tab selected (the shell's `active`
// starts null), so none of these panels are part of first paint — the user
// must open a tab to see any of them. They are also the route's heaviest
// client components (multiplication planner ~763 lines, scenarios panel ~588,
// capacity board ~371). Loading them with ssr:false moves their code off the
// initial First Load JS into chunks fetched after hydration, so the critical
// path shrinks while the panels still mount (state + instant tab switching are
// unchanged once loaded). A lightweight skeleton covers the rare case where a
// tab is opened before its chunk has arrived. Layout shifts caused by the
// skeleton→content swap follow a click, so they are excluded from CLS.

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
  {
    ssr: false,
    loading: () => <PanelSkeleton label="multiplication planner" />,
  }
);

export const CapacityBoard = dynamic(
  () =>
    import("@/components/admin/capacity-board/capacity-board").then(
      (m) => m.CapacityBoard
    ),
  { ssr: false, loading: () => <PanelSkeleton label="capacity board" /> }
);

export const ScenariosPanel = dynamic(
  () =>
    import("@/components/admin/launch-planning/scenarios-panel").then(
      (m) => m.ScenariosPanel
    ),
  { ssr: false, loading: () => <PanelSkeleton label="scenarios" /> }
);

// Forecast-tab client components (also behind a closed tab on first load).
export const LaunchPlanningAssumptionsForm = dynamic(
  () =>
    import("@/components/admin/launch-planning/assumptions-form").then(
      (m) => m.LaunchPlanningAssumptionsForm
    ),
  { ssr: false, loading: () => <PanelSkeleton label="forecast inputs" /> }
);

export const ChurchAttendanceCard = dynamic(
  () =>
    import("@/components/admin/launch-planning/church-attendance-card").then(
      (m) => m.ChurchAttendanceCard
    ),
  { ssr: false, loading: () => <PanelSkeleton label="church attendance" /> }
);
