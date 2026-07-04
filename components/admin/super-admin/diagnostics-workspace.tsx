import type { ReactNode } from "react";
import { SUPER_ADMIN_STICKY_ANCHOR_OFFSET } from "@/components/admin/super-admin-anchors";
import { StatusBadge } from "@/components/admin/console-status";
import { SystemStatusChecklist } from "@/components/admin/system-status-checklist";
import type { SuperAdminConsoleData } from "@/components/admin/super-admin/console-data";
import {
  SubsectionHeader,
  WorkspaceHeader,
} from "@/components/admin/super-admin/console-primitives";

// ---------------------------------------------------------------------------
// Workspace 4 — Diagnostics
// ---------------------------------------------------------------------------

export function DiagnosticsWorkspace({
  data,
  testAccountsPanel,
}: {
  data: SuperAdminConsoleData;
  testAccountsPanel: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <WorkspaceHeader
        title="Diagnostics"
        description="Read-only health checks plus test tools kept separate from the normal app."
      />
      {/* Safe reads grouped apart from the admin-impacting test-account
          actions, so an operator can tell at a glance which half changes
          nothing (#458). */}
      <section aria-label="Read-only checks" className="grid gap-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <SubsectionHeader
            title="Read-only checks"
            hint="Safe to look at anytime: nothing on this half changes the app."
          />
          <StatusBadge label="Read-only" tone="readonly" />
        </div>
        <SystemStatusChecklist rows={data.checklist} />
      </section>
      {/* Admin-impacting half: an amber "watch" border (no stripe) sets it
          apart from the read-only checks above. */}
      <section
        id="test-tools"
        aria-label="Admin-impacting test tools"
        className="grid gap-3 rounded-lg border border-amber bg-surface p-card"
        style={{ scrollMarginTop: SUPER_ADMIN_STICKY_ANCHOR_OFFSET }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h3 className="m-0 font-display text-lg font-medium text-ink">
            Test tools
          </h3>
          <StatusBadge label="Admin-impacting" tone="warning" />
        </div>
        <p className="m-0 font-sans text-sm text-ink2">
          These tools manage real, known-password login accounts kept separate
          from the normal app. Checking status is a safe read; enabling or
          disabling changes who can sign in and asks for confirmation first. No
          secrets are shown.
        </p>
        {testAccountsPanel}
      </section>
    </div>
  );
}
