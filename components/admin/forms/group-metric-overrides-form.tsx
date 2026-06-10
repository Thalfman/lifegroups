"use client";

import { useMemo, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminUpsertGroupMetricSettings } from "@/app/(protected)/admin/settings/actions";
import { cn } from "@/lib/utils";
import {
  fieldHintClassName,
  fieldInputClassName,
  fieldLabelClassName,
  fieldSelectClassName,
  formGridClassName,
  formNoteClassName,
} from "./field-styles";
import type { GroupHealthStatus } from "@/types/enums";
import type { GroupMetricSettingsRow, GroupsRow } from "@/types/database";
import { useActionForm, FormStatus } from "./action-form";
import {
  GROUP_HEALTH_STATUSES,
  GROUP_HEALTH_STATUS_LABEL,
} from "@/lib/admin/health-status-labels";

// Wrapping checkbox label: sentence-case body text, not a tracked field label.
const CHECKBOX_LABEL = "flex items-center gap-2.5 font-sans text-sm text-ink";

// #478 (P2.2): the status options come from the ONE canonical label map, so
// this dropdown and the override summary in settings-shell can't drift.
const HEALTH_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "No manual override" },
  ...GROUP_HEALTH_STATUSES.map((status) => ({
    value: status,
    label: GROUP_HEALTH_STATUS_LABEL[status],
  })),
];

export function GroupMetricOverridesForm({
  groups,
  settingsByGroupId,
}: {
  groups: GroupsRow[];
  settingsByGroupId: Map<string, GroupMetricSettingsRow>;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpsertGroupMetricSettings
  );

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name)),
    [groups]
  );

  // After a successful submit Next revalidates the page; we want the form
  // to stay focused on the same group with the freshly-saved values, so
  // we keep `selectedGroupId` as-is. If the operator wants to clear, they
  // can re-select the placeholder.
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");

  const selected = selectedGroupId
    ? (sortedGroups.find((g) => g.id === selectedGroupId) ?? null)
    : null;
  const currentSettings: GroupMetricSettingsRow | null = selected
    ? (settingsByGroupId.get(selected.id) ?? null)
    : null;

  return (
    <div className="grid gap-4">
      <p className={formNoteClassName}>
        Apply per-group overrides when a group needs its own thresholds — a
        small Bible study with a fixed capacity, a launch group that should not
        yet count against capacity metrics, or a group whose health status the
        dashboard misjudges and you want to set by hand.
      </p>

      <div className="max-w-[420px]">
        <label htmlFor="group_picker" className={fieldLabelClassName}>
          Group
        </label>
        <select
          id="group_picker"
          value={selectedGroupId}
          onChange={(e) => setSelectedGroupId(e.target.value)}
          className={fieldSelectClassName}
        >
          <option value="">Pick a group to edit…</option>
          {sortedGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {selected ? (
        <form
          // Re-mount per group so the defaultValue props reflect the picked row.
          key={selected.id}
          action={formAction}
          className="grid gap-3.5 rounded-sm border border-line bg-bg px-[18px] py-4"
        >
          <input type="hidden" name="group_id" value={selected.id} />
          {/*
            The check-in due-offset override is retired from this surface
            (#472): check-ins are a frozen surface (ADR 0002) and nothing
            visible consumes the offset, so the form no longer submits
            check_in_due_offset_hours_override at all. The full-state upsert
            RPC then normalizes the absent field to null — which is the clear
            path: any stored override is wiped on the next save.
          */}

          <div className={formGridClassName}>
            <div>
              <label
                htmlFor="capacity_override"
                className={fieldLabelClassName}
              >
                Capacity override
              </label>
              <input
                id="capacity_override"
                name="capacity_override"
                type="number"
                min={1}
                max={500}
                inputMode="numeric"
                defaultValue={currentSettings?.capacity_override ?? ""}
                placeholder={
                  selected.capacity != null
                    ? String(selected.capacity)
                    : "Use default"
                }
                className={fieldInputClassName}
              />
              <p className={fieldHintClassName}>
                1–500. Blank = use the group/default capacity.
              </p>
            </div>

            <div>
              <label
                htmlFor="capacity_warning_threshold_pct_override"
                className={fieldLabelClassName}
              >
                Warning % override
              </label>
              <input
                id="capacity_warning_threshold_pct_override"
                name="capacity_warning_threshold_pct_override"
                type="number"
                min={0}
                max={300}
                inputMode="numeric"
                defaultValue={
                  currentSettings?.capacity_warning_threshold_pct_override ?? ""
                }
                placeholder="Use default"
                className={fieldInputClassName}
              />
              <p className={fieldHintClassName}>
                0–300. Blank = use the global default.
              </p>
            </div>

            <div>
              <label
                htmlFor="healthy_attendance_pct_override"
                className={fieldLabelClassName}
              >
                Healthy attendance % override
              </label>
              <input
                id="healthy_attendance_pct_override"
                name="healthy_attendance_pct_override"
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                defaultValue={
                  currentSettings?.healthy_attendance_pct_override ?? ""
                }
                placeholder="Use default"
                className={fieldInputClassName}
              />
              <p className={fieldHintClassName}>
                0–100. Blank = use the global default.
              </p>
            </div>

            <div>
              <label
                htmlFor="manual_health_status_override"
                className={fieldLabelClassName}
              >
                Manual health status
              </label>
              <select
                id="manual_health_status_override"
                name="manual_health_status_override"
                defaultValue={
                  (currentSettings?.manual_health_status_override as GroupHealthStatus | null) ??
                  "none"
                }
                className={fieldSelectClassName}
              >
                {HEALTH_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className={fieldHintClassName}>
                Pins the group&rsquo;s health label on the dashboard.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="exclude_from_capacity_metrics"
              className={CHECKBOX_LABEL}
            >
              <input
                id="exclude_from_capacity_metrics"
                name="exclude_from_capacity_metrics"
                type="checkbox"
                defaultChecked={
                  currentSettings?.exclude_from_capacity_metrics ?? false
                }
                className="h-4 w-4"
              />
              Exclude this group from capacity warnings (e.g. launch group)
            </label>
          </div>

          <div>
            <label htmlFor="allow_over_capacity" className={CHECKBOX_LABEL}>
              <input
                id="allow_over_capacity"
                name="allow_over_capacity"
                type="checkbox"
                defaultChecked={currentSettings?.allow_over_capacity ?? false}
                className="h-4 w-4"
              />
              Keep open past capacity (full, but accepting members by choice)
            </label>
          </div>

          <div>
            <label htmlFor="admin_metric_notes" className={fieldLabelClassName}>
              Admin metric notes
            </label>
            <textarea
              id="admin_metric_notes"
              name="admin_metric_notes"
              rows={3}
              maxLength={1000}
              defaultValue={currentSettings?.admin_metric_notes ?? ""}
              placeholder="Internal notes about why these overrides exist. Admins only."
              className={cn(fieldInputClassName, "resize-y")}
            />
            <p className={fieldHintClassName}>
              Up to 1000 characters. Admins only.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <PButton type="submit" tone="terra" size="md" disabled={pending}>
              {pending ? "Saving…" : "Save overrides"}
            </PButton>
            <FormStatus state={state} successText="Overrides saved." />
          </div>
        </form>
      ) : (
        <p className="m-0 font-sans text-sm italic text-ink3">
          Select a group above to view or change its overrides.
        </p>
      )}
    </div>
  );
}
