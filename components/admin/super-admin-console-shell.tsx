import type { ReactNode } from "react";
import {
  SuperAdminConsole,
  type SuperAdminWorkspace,
} from "@/components/admin/super-admin-console";
import {
  buildSuperAdminConsoleStatus,
  LEGACY_HASH_ALIASES,
  type SuperAdminTestAccountsSummary,
  type SuperAdminWorkspaceId,
} from "@/lib/admin/super-admin-console-model";
import {
  ErrorBanner,
  StatusChip,
} from "@/components/admin/super-admin/console-primitives";
// These seven workspaces are SERVER components: they derive their views from the
// console's profile/member/group Maps server-side and hand only flat,
// minimal props to their client children (e.g. AuditWorkspacePanel builds the
// audit entries server-side). They therefore contribute no client bundle, so
// they must stay server-imported — routing them through a client ssr:false lazy
// wrapper would clientize them and serialize the full, care-sensitive data set
// to the browser just to open a tab.
import { ReadinessWorkspace } from "@/components/admin/super-admin/readiness-workspace";
import { AccessWorkspace } from "@/components/admin/super-admin/access-workspace";
import { ConfigWorkspace } from "@/components/admin/super-admin/config-workspace";
import { DiagnosticsWorkspace } from "@/components/admin/super-admin/diagnostics-workspace";
import { AuditWorkspacePanel } from "@/components/admin/super-admin/audit-workspace-panel";
import { UsageWorkspace } from "@/components/admin/super-admin/usage-workspace";
import { DangerWorkspace } from "@/components/admin/super-admin/danger-workspace";
import type { SuperAdminConsoleData } from "@/components/admin/super-admin/console-data";

// The shared risk/status vocabulary (#451) lives in console-status so client
// consoles can import it without pulling this server module graph; re-exported
// here so existing importers keep working.
export { StatusBadge, STATUS_STYLE } from "@/components/admin/console-status";
export type { StatusTone } from "@/components/admin/console-status";

// Moved to the pure console model (with the rest of the status derivation);
// re-exported so existing importers (the super-admin page) keep working.
export type { SuperAdminTestAccountsSummary } from "@/lib/admin/super-admin-console-model";

// The console data shape + coverage read shapes live in console-data; re-exported
// here so existing importers (the super-admin page) keep working.
export type {
  SuperAdminConsoleData,
  SuperAdminConsoleCoverageAssignment,
  SuperAdminConsoleOverShepherd,
  SuperAdminConsoleCoverageLeader,
} from "@/components/admin/super-admin/console-data";

export function SuperAdminConsoleShell({
  data,
  testAccountsPanel,
  testAccountsSummary,
}: {
  data: SuperAdminConsoleData;
  testAccountsPanel: ReactNode;
  testAccountsSummary: SuperAdminTestAccountsSummary;
}) {
  // Every status-row chip, the readiness signal, and the Next-step card come
  // from the pure console model so the branching is unit-tested there; the
  // shell only renders the result.
  const status = buildSuperAdminConsoleStatus({
    errors: data.errors,
    checklist: data.checklist,
    profiles: data.profilesById.values(),
    latestAuditEventAt: data.auditEvents[0]?.created_at ?? null,
    auditEventCount: data.auditEventCount,
    featureFlags: data.appConfig.featureFlags,
    testAccountsSummary,
  });

  const statusRow = (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      {status.chips.map((chip) => (
        <StatusChip key={chip.label} {...chip} />
      ))}
    </div>
  );

  // SuperAdminWorkspaceId keeps every tab id a hash the console model (and its
  // LEGACY_HASH_ALIASES targets) declares.
  const workspaces: (SuperAdminWorkspace & { id: SuperAdminWorkspaceId })[] = [
    {
      id: "readiness",
      label: "Readiness",
      node: (
        <ReadinessWorkspace
          data={data}
          status={status}
          testAccountsSummary={testAccountsSummary}
        />
      ),
    },
    {
      id: "access",
      label: "Access",
      node: <AccessWorkspace data={data} />,
    },
    {
      id: "config",
      label: "Config",
      node: <ConfigWorkspace data={data} />,
    },
    {
      id: "diagnostics",
      label: "Diagnostics",
      node: (
        <DiagnosticsWorkspace
          data={data}
          testAccountsPanel={testAccountsPanel}
        />
      ),
    },
    {
      id: "audit",
      label: "Audit",
      node: <AuditWorkspacePanel data={data} />,
    },
    {
      id: "usage",
      label: "Usage",
      node: <UsageWorkspace data={data} />,
    },
    {
      id: "danger",
      label: "Danger Zone",
      danger: true,
      node: <DangerWorkspace data={data} />,
    },
  ];

  return (
    <SuperAdminConsole
      statusRow={statusRow}
      // Rendered above every workspace so a failed read stays visible no matter
      // which workspace is open (only the active panel mounts).
      banner={status.errorCount > 0 ? <ErrorBanner /> : null}
      workspaces={workspaces}
      defaultWorkspaceId="readiness"
      hashAliases={LEGACY_HASH_ALIASES}
    />
  );
}
