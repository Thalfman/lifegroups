"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { P } from "@/lib/pastoral";

// The Super Admin Console shows one workspace at a time (the console mounts only
// the active panel), and each workspace is a heavy bundle of forms — Access
// alone pulls in seven. Loading them with ssr:false keeps their code out of this
// route's First Load JS: a workspace's chunk is fetched when its tab is first
// opened. Mirrors launch-planning/lazy-panels.tsx.

const skeletonStyle: CSSProperties = {
  minHeight: 280,
  borderRadius: 14,
  border: `1px solid ${P.line}`,
  background: `linear-gradient(90deg, ${P.surface} 0%, ${P.bgDeep} 50%, ${P.surface} 100%)`,
  backgroundSize: "200% 100%",
  animation: "lg-panel-shimmer 1.2s ease-in-out infinite",
};

function WorkspaceSkeleton({ label }: { label: string }) {
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

export const ReadinessWorkspace = dynamic(
  () =>
    import("@/components/admin/super-admin/readiness-workspace").then(
      (m) => m.ReadinessWorkspace
    ),
  { ssr: false, loading: () => <WorkspaceSkeleton label="readiness" /> }
);

export const AccessWorkspace = dynamic(
  () =>
    import("@/components/admin/super-admin/access-workspace").then(
      (m) => m.AccessWorkspace
    ),
  { ssr: false, loading: () => <WorkspaceSkeleton label="access" /> }
);

export const ConfigWorkspace = dynamic(
  () =>
    import("@/components/admin/super-admin/config-workspace").then(
      (m) => m.ConfigWorkspace
    ),
  { ssr: false, loading: () => <WorkspaceSkeleton label="config" /> }
);

export const DiagnosticsWorkspace = dynamic(
  () =>
    import("@/components/admin/super-admin/diagnostics-workspace").then(
      (m) => m.DiagnosticsWorkspace
    ),
  { ssr: false, loading: () => <WorkspaceSkeleton label="diagnostics" /> }
);

export const AuditWorkspacePanel = dynamic(
  () =>
    import("@/components/admin/super-admin/audit-workspace-panel").then(
      (m) => m.AuditWorkspacePanel
    ),
  { ssr: false, loading: () => <WorkspaceSkeleton label="audit" /> }
);

export const UsageWorkspace = dynamic(
  () =>
    import("@/components/admin/super-admin/usage-workspace").then(
      (m) => m.UsageWorkspace
    ),
  { ssr: false, loading: () => <WorkspaceSkeleton label="usage" /> }
);

export const DangerWorkspace = dynamic(
  () =>
    import("@/components/admin/super-admin/danger-workspace").then(
      (m) => m.DangerWorkspace
    ),
  { ssr: false, loading: () => <WorkspaceSkeleton label="danger zone" /> }
);
