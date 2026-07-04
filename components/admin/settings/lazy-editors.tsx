"use client";

import dynamic from "next/dynamic";

// Settings shows one tab at a time (the shared Tabs primitive mounts only the
// active panel), and its forms/editors are the surface's heaviest client
// components. Loading them with ssr:false keeps their code out of this route's
// First Load JS — each editor's chunk is fetched when its tab is first opened,
// not up front. Mirrors launch-planning/lazy-panels.tsx.

// The shimmer gradient composes the raw --c-* palette vars (surface → sidebar
// → surface) because Tailwind has no token for a multi-stop gradient.
const skeletonClassName =
  "min-h-[220px] animate-[lg-panel-shimmer_1.2s_ease-in-out_infinite] rounded-lg border border-line bg-[linear-gradient(90deg,var(--c-surface)_0%,var(--c-sidebar)_50%,var(--c-surface)_100%)] bg-[length:200%_100%]";

function EditorSkeleton({ label }: { label: string }) {
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
