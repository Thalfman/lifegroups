"use client";

import { PButton } from "@/components/pastoral/button";
import { adminUpdateMetricDefaults } from "@/app/(protected)/admin/settings/actions";
import { P, fontBody } from "@/lib/pastoral";
import {
  fieldInputStyle,
  fieldLabelStyle,
  formGridStyle,
} from "./field-styles";
import type { MetricDefaults } from "@/lib/admin/metrics";
import { useActionForm, FormStatus } from "./action-form";

export function MetricDefaultsForm({ defaults }: { defaults: MetricDefaults }) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateMetricDefaults
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        These are the few defaults most ministries touch — care cadence and the
        default group capacity. The fuller set of capacity and attendance
        thresholds lives under Advanced thresholds below. Leave a field blank to
        keep its current value.
      </p>

      {/* S1 (#221) primary path: the handful of settings an operator actually
          changes — care cadence (the two stale-contact windows) and the default
          group capacity. Everything else is demoted into Advanced thresholds. */}
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="default_group_capacity" style={fieldLabelStyle}>
            Default group capacity
          </label>
          <input
            id="default_group_capacity"
            name="default_group_capacity"
            type="number"
            min={1}
            max={500}
            inputMode="numeric"
            defaultValue={defaults.default_group_capacity ?? ""}
            placeholder="Unknown"
            style={fieldInputStyle}
          />
          <p style={hintStyle}>1–500. Blank means Unknown.</p>
        </div>

        <div>
          <label
            htmlFor="shepherd_care_stale_days_direct"
            style={fieldLabelStyle}
          >
            Care stale-contact — directly overseen (days)
          </label>
          <input
            id="shepherd_care_stale_days_direct"
            name="shepherd_care_stale_days_direct"
            type="number"
            min={7}
            max={365}
            inputMode="numeric"
            defaultValue={defaults.shepherd_care_stale_days_direct}
            style={fieldInputStyle}
          />
          <p style={hintStyle}>
            Days since last contact before a leader the Ministry Admin oversees
            directly is flagged on the care dashboard. 7–365.
          </p>
        </div>

        <div>
          <label
            htmlFor="shepherd_care_stale_days_delegated"
            style={fieldLabelStyle}
          >
            Care stale-contact — delegated (days)
          </label>
          <input
            id="shepherd_care_stale_days_delegated"
            name="shepherd_care_stale_days_delegated"
            type="number"
            min={7}
            max={365}
            inputMode="numeric"
            defaultValue={defaults.shepherd_care_stale_days_delegated}
            style={fieldInputStyle}
          />
          <p style={hintStyle}>
            Days since last contact before a leader with an active over-shepherd
            is flagged on the care dashboard. 7–365.
          </p>
        </div>
      </div>

      {/* S1 (#221): the capacity / attendance thresholds sit behind a
          disclosure. The editable thresholds stay mounted inside the form, so
          they still submit when collapsed. The two read-only check-in cadence
          reference rows were retired from this surface entirely (#472) —
          check-ins are a frozen surface (ADR 0002, #160) and nothing consumes
          those values here. */}
      <details style={detailsStyle}>
        <summary style={summaryStyle}>Advanced thresholds</summary>
        <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
          <div className="lg-m-grid-stack" style={formGridStyle}>
            <div>
              <label
                htmlFor="capacity_warning_threshold_pct"
                style={fieldLabelStyle}
              >
                Capacity warning %
              </label>
              <input
                id="capacity_warning_threshold_pct"
                name="capacity_warning_threshold_pct"
                type="number"
                min={0}
                max={300}
                inputMode="numeric"
                defaultValue={defaults.capacity_warning_threshold_pct}
                style={fieldInputStyle}
              />
              <p style={hintStyle}>Flag at this fill % (0–300).</p>
            </div>

            <div>
              <label
                htmlFor="capacity_full_threshold_pct"
                style={fieldLabelStyle}
              >
                Capacity full %
              </label>
              <input
                id="capacity_full_threshold_pct"
                name="capacity_full_threshold_pct"
                type="number"
                min={1}
                max={300}
                inputMode="numeric"
                defaultValue={defaults.capacity_full_threshold_pct}
                style={fieldInputStyle}
              />
              <p style={hintStyle}>
                Mark as full at this % (1–300, ≥ warning).
              </p>
            </div>

            <div>
              <label
                htmlFor="default_healthy_attendance_pct"
                style={fieldLabelStyle}
              >
                Healthy attendance %
              </label>
              <input
                id="default_healthy_attendance_pct"
                name="default_healthy_attendance_pct"
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                defaultValue={defaults.default_healthy_attendance_pct}
                style={fieldInputStyle}
              />
              <p style={hintStyle}>0–100. Below this is flagged as low.</p>
            </div>
          </div>

          {/* Admin IM 05 (#265): the two director-confirmed Group-health triage
              thresholds. Sourced here (not hard-coded) so the Watch filter
              honours the director's mental model. */}
          <div className="lg-m-grid-stack" style={formGridStyle}>
            <div>
              <label htmlFor="group_health_watch_grade" style={fieldLabelStyle}>
                Group-health Watch grade
              </label>
              <select
                id="group_health_watch_grade"
                name="group_health_watch_grade"
                defaultValue={defaults.group_health_watch_grade}
                style={fieldInputStyle}
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
              <p style={hintStyle}>
                Groups graded at or below this letter land on the Watch filter.
              </p>
            </div>

            <div>
              <label
                htmlFor="group_health_attendance_decline_margin_pct"
                style={fieldLabelStyle}
              >
                Attendance decline margin (points)
              </label>
              <input
                id="group_health_attendance_decline_margin_pct"
                name="group_health_attendance_decline_margin_pct"
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                defaultValue={
                  defaults.group_health_attendance_decline_margin_pct
                }
                style={fieldInputStyle}
              />
              <p style={hintStyle}>
                0–100. A group whose recent 4-week attendance average drops
                below the prior 4 weeks by at least this many points counts as
                declining (Watch).
              </p>
            </div>
          </div>
        </div>
      </details>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save defaults"}
        </PButton>
        <FormStatus state={state} successText="Defaults saved." />
      </div>
    </form>
  );
}

const hintStyle = {
  fontFamily: fontBody,
  fontSize: 11,
  color: P.ink3,
  margin: "4px 0 0",
  lineHeight: 1.4,
} as const;

const detailsStyle = {
  border: `1px solid ${P.line}`,
  borderRadius: 10,
  padding: "12px 16px",
  background: P.bg,
} as const;

const summaryStyle = {
  fontFamily: fontBody,
  fontSize: 13,
  fontWeight: 600,
  color: P.ink,
  cursor: "pointer",
} as const;
