import { OwnerControlsOverview } from "@/components/admin/owner-controls-overview";
import type {
  SuperAdminConsoleStatus,
  SuperAdminTestAccountsSummary,
} from "@/lib/admin/super-admin-console-model";
import type { SuperAdminConsoleData } from "@/components/admin/super-admin/console-data";
import {
  CARD_GRID_CLASS,
  CommandCard,
  MetricRow,
  NextActionCard,
  WorkspaceHeader,
} from "@/components/admin/super-admin/console-primitives";

// ---------------------------------------------------------------------------
// Workspace 1 — Readiness (default)
// ---------------------------------------------------------------------------

export function ReadinessWorkspace({
  data,
  status,
  testAccountsSummary,
}: {
  data: SuperAdminConsoleData;
  status: SuperAdminConsoleStatus;
  testAccountsSummary: SuperAdminTestAccountsSummary;
}) {
  return (
    <div className="grid min-w-0 gap-4">
      <WorkspaceHeader
        title="Readiness"
        description="Whether the platform is ready, and the one thing worth doing next. The rest of the controls live in the workspaces above."
      />
      <NextActionCard action={status.nextAction} />
      <div className={CARD_GRID_CLASS}>
        <CommandCard
          title="Readiness signal"
          description={`${status.checklistWarningCount} readiness warning${
            status.checklistWarningCount === 1 ? "" : "s"
          } and ${status.errorCount} load error${
            status.errorCount === 1 ? "" : "s"
          } across the current reads.`}
          status={{ label: status.readinessLabel, tone: status.readinessTone }}
        />
        <CommandCard
          title="Access"
          description="Role changes stay limited to active, non-self, non-super-admin profiles."
          status={{ label: "Good", tone: "good" }}
        >
          <MetricRow label="Active profiles" value={status.activeProfiles} />
          <MetricRow
            label="Eligible role targets"
            value={data.assignableProfiles.length}
          />
        </CommandCard>
        <CommandCard
          title="Test accounts"
          description={testAccountsSummary.description}
          status={{
            label: testAccountsSummary.label,
            tone: testAccountsSummary.tone,
          }}
        />
      </div>
      <HelpAboutDetails />
    </div>
  );
}

// The long "what lives here" copy lives behind a plain disclosure so the default
// dashboard stays compact.
function HelpAboutDetails() {
  return (
    <details className="rounded-lg border border-line bg-surface">
      <summary className="lg-sac-summary flex items-center gap-2 px-[18px] py-3 font-sans text-sm font-semibold text-ink2">
        About this console
      </summary>
      <div className="px-[18px] pb-[18px] pt-1">
        <OwnerControlsOverview />
      </div>
    </details>
  );
}
