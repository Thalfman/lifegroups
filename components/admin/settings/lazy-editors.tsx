"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { P } from "@/lib/pastoral";

// Settings shows one tab at a time (the shared Tabs primitive mounts only the
// active panel), and its forms/editors are the surface's heaviest client
// components. Loading them with ssr:false keeps their code out of this route's
// First Load JS — each editor's chunk is fetched when its tab is first opened,
// not up front. Mirrors launch-planning/lazy-panels.tsx.

const skeletonStyle: CSSProperties = {
  minHeight: 220,
  borderRadius: 14,
  border: `1px solid ${P.line}`,
  background: `linear-gradient(90deg, ${P.surface} 0%, ${P.bgDeep} 50%, ${P.surface} 100%)`,
  backgroundSize: "200% 100%",
  animation: "lg-panel-shimmer 1.2s ease-in-out infinite",
};

function EditorSkeleton({ label }: { label: string }) {
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

export const HealthRubricEditor = dynamic(
  () =>
    import("@/components/admin/settings/health-rubric-editor").then(
      (m) => m.HealthRubricEditor
    ),
  { ssr: false, loading: () => <EditorSkeleton label="health rubric editor" /> }
);

export const GroupTypesEditor = dynamic(
  () =>
    import("@/components/admin/settings/group-types-editor").then(
      (m) => m.GroupTypesEditor
    ),
  { ssr: false, loading: () => <EditorSkeleton label="group types editor" /> }
);

export const MultiplyTriggerEditor = dynamic(
  () =>
    import("@/components/admin/settings/multiply-trigger-editor").then(
      (m) => m.MultiplyTriggerEditor
    ),
  {
    ssr: false,
    loading: () => <EditorSkeleton label="multiplication trigger editor" />,
  }
);

export const MetricDefaultsForm = dynamic(
  () =>
    import("@/components/admin/forms/metric-defaults-form").then(
      (m) => m.MetricDefaultsForm
    ),
  { ssr: false, loading: () => <EditorSkeleton label="metric defaults" /> }
);

export const GroupMetricOverridesForm = dynamic(
  () =>
    import("@/components/admin/forms/group-metric-overrides-form").then(
      (m) => m.GroupMetricOverridesForm
    ),
  {
    ssr: false,
    loading: () => <EditorSkeleton label="group metric overrides" />,
  }
);

export const PeopleImportForm = dynamic(
  () =>
    import("@/components/admin/forms/people-import-form").then(
      (m) => m.PeopleImportForm
    ),
  { ssr: false, loading: () => <EditorSkeleton label="people import" /> }
);
