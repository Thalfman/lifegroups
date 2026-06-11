// Pure derivations for Settings > Thresholds "Per-group overrides": which
// groups carry an active override (joined to their GroupsRow and sorted for
// display), and the summary chips a single override row shows. No DB, no I/O —
// extracted from the Settings shell so the branching is unit-testable without
// rendering. The "is anything overridden" predicate itself stays in
// lib/admin/metrics (hasActiveOverrides); this module composes it.

import { hasActiveOverrides } from "@/lib/admin/metrics";
import { groupHealthStatusLabel } from "@/lib/admin/health-status-labels";
import type { GroupMetricSettingsRow, GroupsRow } from "@/types/database";

export type OverrideRow = {
  settings: GroupMetricSettingsRow;
  group: GroupsRow;
};

// The "Groups with active overrides" list: only settings rows with at least
// one active override, joined to their group (a settings row whose group is
// missing from the loaded set is dropped — nothing to label it with), sorted
// by group name.
export function buildOverrideRows(
  groups: GroupsRow[],
  groupMetricSettings: GroupMetricSettingsRow[]
): OverrideRow[] {
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  return groupMetricSettings
    .filter((s) => hasActiveOverrides(s))
    .flatMap((settings) => {
      const group = groupsById.get(settings.group_id);
      return group ? [{ settings, group }] : [];
    })
    .sort((a, b) => a.group.name.localeCompare(b.group.name));
}

export type OverrideSummaryChip = {
  key: string;
  label: string;
  tone?: "neutral" | "watch" | "followup";
};

// One chip per active override on a settings row, in a fixed display order.
// The manual health chip echoes the CANONICAL status label (#478, P2.2) — the
// same map the override form's dropdown offers — never de-underscored enum
// text. A whitespace-only note earns no chip.
export function overrideSummaryChips(
  settings: GroupMetricSettingsRow
): OverrideSummaryChip[] {
  const chips: OverrideSummaryChip[] = [];
  if (settings.capacity_override != null)
    chips.push({ key: "cap", label: `Capacity ${settings.capacity_override}` });
  if (settings.capacity_warning_threshold_pct_override != null)
    chips.push({
      key: "warn",
      label: `Warning ${settings.capacity_warning_threshold_pct_override}%`,
    });
  if (settings.healthy_attendance_pct_override != null)
    chips.push({
      key: "att",
      label: `Healthy ≥ ${settings.healthy_attendance_pct_override}%`,
    });
  if (settings.manual_health_status_override) {
    chips.push({
      key: "health",
      label: `Health: ${groupHealthStatusLabel(
        settings.manual_health_status_override
      )}`,
      tone: "watch",
    });
  }
  if (settings.exclude_from_capacity_metrics)
    chips.push({
      key: "ex",
      label: "Excluded from capacity",
      tone: "followup",
    });
  if (
    settings.admin_metric_notes &&
    settings.admin_metric_notes.trim().length > 0
  )
    chips.push({ key: "note", label: "Has notes" });
  return chips;
}
