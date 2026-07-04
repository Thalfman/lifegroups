"use client";

import { adminUpsertGroupMetricSettings } from "@/app/(protected)/admin/settings/actions";
import { ConfirmActionButton } from "./confirm-action-button";

// Clears every override field on a group_metric_settings row by calling
// the upsert RPC with all nulls. The row stays in the table (no hard
// delete) but every helper that consults it -- hasActiveOverrides,
// effectiveCapacity, effectiveHealthStatus -- will see "no override".

// Exported so the copy stays byte-locked by the confirm-action-button test.
export function clearGroupMetricOverridesConfirmMessage(
  groupName: string
): string {
  return `Clear all metric overrides on ${groupName}? It'll fall back to the global defaults.`;
}

export function ClearGroupMetricOverridesButton({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  return (
    <ConfirmActionButton
      action={adminUpsertGroupMetricSettings}
      confirmMessage={clearGroupMetricOverridesConfirmMessage(groupName)}
      hiddenFields={[
        { name: "group_id", value: groupId },
        { name: "capacity_override", value: "" },
        { name: "capacity_warning_threshold_pct_override", value: "" },
        { name: "healthy_attendance_pct_override", value: "" },
        { name: "manual_health_status_override", value: "none" },
        // exclude_from_capacity_metrics is intentionally NOT submitted so the
        // server action reads it as `false` (browsers omit unchecked
        // checkboxes). admin_metric_notes is omitted -> "" -> null.
        { name: "admin_metric_notes", value: "" },
      ]}
      idleLabel="Clear overrides"
      pendingLabel="Clearing…"
      variant="ghost"
      gap={4}
    />
  );
}
