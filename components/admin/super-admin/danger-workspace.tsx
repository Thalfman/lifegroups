import {
  DangerZoneConsole,
  type DangerWorkflowGroup,
} from "@/components/admin/danger-zone-console";
import { ResetAllCard } from "@/components/admin/reset-all-card";
import { LaunchPrepCard } from "@/components/admin/launch-prep-card";
import { CleanSlateCard } from "@/components/admin/clean-slate-card";
import { HistoryResetCard } from "@/components/admin/history-reset-card";
import { AttentionResetCard } from "@/components/admin/attention-reset-card";
import { AuditResetCard } from "@/components/admin/audit-reset-card";
import { PermanentDeleteCard } from "@/components/admin/permanent-delete-card";
import type { SuperAdminConsoleData } from "@/components/admin/super-admin/console-data";

// ---------------------------------------------------------------------------
// Workspace 6 — Danger Zone
// ---------------------------------------------------------------------------

export function DangerWorkspace({ data }: { data: SuperAdminConsoleData }) {
  // Chooser groups ordered by risk (#462), lowest first: launch preparation,
  // then the recoverable history/attention resets, then the audit log, and
  // finally permanent deletion — set apart via the destructive group panel.
  // Grouping, ordering, and labels only; every workflow card, type-to-confirm
  // gate, snapshot, and server action is unchanged.
  const groups: DangerWorkflowGroup[] = [
    {
      id: "launch-preparation",
      label: "Launch preparation",
      workflows: [
        {
          id: "launch-prep",
          label: "Prepare for launch",
          riskNote:
            "Clear all history and hide the time-based launch warnings.",
          node: (
            <LaunchPrepCard
              impact={data.cleanSlateImpact}
              featureFlags={data.appConfig.featureFlags}
            />
          ),
        },
        {
          id: "reset-all",
          label: "Reset everything",
          riskNote:
            "One clean launch state — history, warnings, and attention.",
          node: (
            <ResetAllCard
              impact={data.cleanSlateImpact}
              featureFlags={data.appConfig.featureFlags}
              attentionState={data.attentionResetState}
            />
          ),
        },
      ],
    },
    {
      id: "history-attention-resets",
      label: "History and attention resets",
      // Narrowest reset first: attention (Home cards only), one history
      // category, then all history at once.
      workflows: [
        {
          id: "attention",
          label: "Reset attention",
          riskNote: "Fresh start for the time-based Home cards.",
          node: <AttentionResetCard state={data.attentionResetState} />,
        },
        {
          id: "history-category",
          label: "Reset by category",
          riskNote: "Clear one kind of history at a time.",
          node: <HistoryResetCard state={data.historyResetState} />,
        },
        {
          id: "clean-slate",
          label: "Clean slate",
          riskNote: "Clear all accumulated history at once.",
          node: (
            <CleanSlateCard
              impact={data.cleanSlateImpact}
              snapshot={data.latestCleanSlateSnapshot}
            />
          ),
        },
      ],
    },
    {
      id: "audit-log-actions",
      label: "Audit log actions",
      workflows: [
        {
          id: "audit",
          label: "Reset audit log",
          riskNote: "Archive, then purge the live audit log.",
          node: <AuditResetCard auditEventCount={data.auditEventCount} />,
        },
      ],
    },
    {
      id: "permanent-deletion",
      label: "Permanent deletion",
      destructive: true,
      workflows: [
        {
          id: "permanent",
          label: "Permanent deletion",
          riskNote:
            "Physically remove a single curated record. Cannot be undone from the app.",
          destructive: true,
          node: (
            <PermanentDeleteCard
              targets={data.permanentDeletionTargets}
              tombstones={data.recentTombstones}
            />
          ),
        },
      ],
    },
  ];

  return <DangerZoneConsole groups={groups} />;
}
