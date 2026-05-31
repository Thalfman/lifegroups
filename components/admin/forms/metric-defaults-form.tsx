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
        These thresholds are used across the dashboard to flag capacity,
        attendance, and leader-care warnings. Leave a field blank to keep its
        current value.
      </p>

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
          <label htmlFor="capacity_full_threshold_pct" style={fieldLabelStyle}>
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
          <p style={hintStyle}>Mark as full at this % (1–300, ≥ warning).</p>
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

const hintStyle = {
  fontFamily: fontBody,
  fontSize: 11,
  color: P.ink3,
  margin: "4px 0 0",
  lineHeight: 1.4,
} as const;
