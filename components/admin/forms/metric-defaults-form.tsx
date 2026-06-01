"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminUpdateMetricDefaults } from "@/app/(protected)/admin/settings/actions";
import { P, fontBody } from "@/lib/pastoral";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  formGridStyle,
  successTextStyle,
} from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";
import type { MetricDefaults } from "@/lib/admin/metrics";

type State = ActionResult<{ id: string }> | undefined;

export function MetricDefaultsForm({ defaults }: { defaults: MetricDefaults }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminUpdateMetricDefaults,
    undefined
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

      {/* S1 (#221): the capacity / attendance thresholds plus the (frozen)
          check-in cadence values sit behind a disclosure. The editable
          thresholds stay mounted inside the form, so they still submit when
          collapsed. The two check-in values are read-only — check-ins are a
          frozen surface (ADR 0002, #160) — shown here as "current defaults". */}
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

          <div className="lg-m-grid-stack" style={formGridStyle}>
            <ReadOnlyDefault
              label="Check-in due offset (hours)"
              value={`${defaults.check_in_due_offset_hours} hours`}
            />
            <ReadOnlyDefault
              label="Missed check-in warning (weeks)"
              value={`${defaults.missed_checkin_warning_weeks} weeks`}
            />
          </div>
          <p style={hintStyle}>
            Check-in timing is a frozen surface — these values are shown for
            reference and aren&rsquo;t edited here.
          </p>
        </div>
      </details>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save defaults"}
        </PButton>
        {state?.ok ? (
          <span style={successTextStyle}>Defaults saved.</span>
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
  );
}

// A frozen check-in cadence value, shown read-only inside Advanced thresholds
// so the operator can see the current default without an editable control.
function ReadOnlyDefault({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={fieldLabelStyle}>{label}</span>
      <div
        style={{
          ...fieldInputStyle,
          background: P.bg,
          color: P.ink2,
          display: "flex",
          alignItems: "center",
        }}
      >
        {value}
      </div>
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
