"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminUpsertGroupMetricSettings } from "@/app/(protected)/admin/settings/actions";
import { P, fontBody } from "@/lib/pastoral";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  formGridStyle,
  successTextStyle,
} from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";
import type { GroupHealthStatus } from "@/types/enums";
import type { GroupMetricSettingsRow, GroupsRow } from "@/types/database";

type State = ActionResult<{ id: string }> | undefined;

const HEALTH_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "No manual override" },
  { value: "healthy", label: "Healthy" },
  { value: "watch", label: "Watch" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "healthy_paused", label: "Healthy (paused)" },
  { value: "restart_soon", label: "Restart soon" },
  { value: "overdue_restart", label: "Overdue restart" },
  { value: "capacity_full", label: "Capacity full" },
  { value: "needs_leader_support", label: "Needs leader support" },
];

export function GroupMetricOverridesForm({
  groups,
  settingsByGroupId,
}: {
  groups: GroupsRow[];
  settingsByGroupId: Map<string, GroupMetricSettingsRow>;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminUpsertGroupMetricSettings,
    undefined
  );

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name)),
    [groups]
  );

  const [selectedGroupId, setSelectedGroupId] = useState<string>("");

  // After a successful submit Next revalidates the page; we want the form
  // to stay focused on the same group with the freshly-saved values, so
  // we keep `selectedGroupId` as-is. If the operator wants to clear, they
  // can re-select the placeholder.
  useEffect(() => {
    if (state?.ok) {
      // nothing to do -- revalidation rebuilds the data prop
    }
  }, [state]);

  const selected = selectedGroupId
    ? (sortedGroups.find((g) => g.id === selectedGroupId) ?? null)
    : null;
  const currentSettings: GroupMetricSettingsRow | null = selected
    ? (settingsByGroupId.get(selected.id) ?? null)
    : null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        Apply per-group overrides when a group needs its own thresholds — a
        small Bible study with a fixed capacity, a launch group that should not
        yet count against capacity metrics, or a group whose health status the
        dashboard misjudges and you want to set by hand.
      </p>

      <div style={{ maxWidth: 420 }}>
        <label htmlFor="group_picker" style={fieldLabelStyle}>
          Group
        </label>
        <select
          id="group_picker"
          value={selectedGroupId}
          onChange={(e) => setSelectedGroupId(e.target.value)}
          style={fieldSelectStyle}
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
          style={{
            display: "grid",
            gap: 14,
            background: P.bg,
            border: `1px solid ${P.line}`,
            borderRadius: 10,
            padding: "16px 18px",
          }}
        >
          <input type="hidden" name="group_id" value={selected.id} />
          {/*
            Check-ins are a frozen surface (ADR 0002), so this offset is no
            longer editable here (#160). The upsert RPC is full-state, so we
            still round-trip the stored value through a hidden field — omitting
            it would let validation normalize the absent field to null and
            silently wipe any existing per-group override on the next save of
            an unrelated setting.
          */}
          <input
            type="hidden"
            name="check_in_due_offset_hours_override"
            value={currentSettings?.check_in_due_offset_hours_override ?? ""}
          />

          <div className="lg-m-grid-stack" style={formGridStyle}>
            <div>
              <label htmlFor="capacity_override" style={fieldLabelStyle}>
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
                style={fieldInputStyle}
              />
              <p style={hintStyle}>
                1–500. Blank = use the group/default capacity.
              </p>
            </div>

            <div>
              <label
                htmlFor="capacity_warning_threshold_pct_override"
                style={fieldLabelStyle}
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
                style={fieldInputStyle}
              />
              <p style={hintStyle}>0–300. Blank = use the global default.</p>
            </div>

            <div>
              <label
                htmlFor="healthy_attendance_pct_override"
                style={fieldLabelStyle}
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
                style={fieldInputStyle}
              />
              <p style={hintStyle}>0–100. Blank = use the global default.</p>
            </div>

            <div>
              <label
                htmlFor="manual_health_status_override"
                style={fieldLabelStyle}
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
                style={fieldSelectStyle}
              >
                {HEALTH_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p style={hintStyle}>
                Pins the group&rsquo;s health label on the dashboard.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="exclude_from_capacity_metrics"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink,
              }}
            >
              <input
                id="exclude_from_capacity_metrics"
                name="exclude_from_capacity_metrics"
                type="checkbox"
                defaultChecked={
                  currentSettings?.exclude_from_capacity_metrics ?? false
                }
                style={{ width: 16, height: 16 }}
              />
              Exclude this group from capacity warnings (e.g. launch group)
            </label>
          </div>

          <div>
            <label
              htmlFor="allow_over_capacity"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink,
              }}
            >
              <input
                id="allow_over_capacity"
                name="allow_over_capacity"
                type="checkbox"
                defaultChecked={currentSettings?.allow_over_capacity ?? false}
                style={{ width: 16, height: 16 }}
              />
              Keep open past capacity (full, but accepting members by choice)
            </label>
          </div>

          <div>
            <label htmlFor="admin_metric_notes" style={fieldLabelStyle}>
              Admin metric notes
            </label>
            <textarea
              id="admin_metric_notes"
              name="admin_metric_notes"
              rows={3}
              maxLength={1000}
              defaultValue={currentSettings?.admin_metric_notes ?? ""}
              placeholder="Internal notes about why these overrides exist. Admins only."
              style={{ ...fieldInputStyle, resize: "vertical" }}
            />
            <p style={hintStyle}>Up to 1000 characters. Admins only.</p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <PButton type="submit" tone="terra" size="md" disabled={pending}>
              {pending ? "Saving…" : "Save overrides"}
            </PButton>
            {state?.ok ? (
              <span style={successTextStyle}>Overrides saved.</span>
            ) : null}
          </div>

          {state && !state.ok ? (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gap: 6,
              }}
            >
              {state.errors.map((err, i) => (
                <li key={i}>
                  <p style={errorTextStyle}>{err}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      ) : (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink3,
            margin: 0,
            fontStyle: "italic",
          }}
        >
          Select a group above to view or change its overrides.
        </p>
      )}
    </div>
  );
}

const hintStyle = {
  fontFamily: fontBody,
  fontSize: 11,
  color: P.ink3,
  margin: "4px 0 0",
  lineHeight: 1.4,
} as const;
