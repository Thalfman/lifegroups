"use client";

import { useActionState, useRef } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminUpdateLaunchPlanningAssumptions } from "@/app/(protected)/admin/launch-planning/actions";
import { nextSeasonAnchorIso } from "@/lib/admin/launch-planning";
import { P, fontBody } from "@/lib/pastoral";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  formGridStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import type { ActionResult } from "@/lib/admin/action-result";
import type { LaunchPlanningAssumptions } from "@/lib/admin/launch-planning";

type State = ActionResult<{ id: string }> | undefined;

// Format a fractional ratio (0–1) as a percent string with up to 1
// decimal place, preserving any non-zero fractional part so an existing
// value like 0.625 round-trips as 62.5 rather than truncating to 63.
function pctValue(ratio: number): string {
  const pct = ratio * 100;
  // Strip trailing zeros after the decimal: 60.0 -> 60, 62.5 -> 62.5.
  return Number.isInteger(pct)
    ? String(pct)
    : pct.toFixed(1).replace(/\.0$/, "");
}

export function LaunchPlanningAssumptionsForm({
  assumptions,
}: {
  assumptions: LaunchPlanningAssumptions;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminUpdateLaunchPlanningAssumptions,
    undefined
  );
  const growthDateRef = useRef<HTMLInputElement>(null);

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
        Enter your best estimates. We only count current active groups in the
        capacity math; growth and timing below are your judgement calls. Current
        church attendance is set in the Church attendance card above. Leave a
        field blank to keep its current value.
      </p>

      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="expected_growth" style={fieldLabelStyle}>
            Expected growth (people)
          </label>
          <input
            id="expected_growth"
            name="expected_growth"
            type="number"
            min={-100000}
            max={100000}
            inputMode="numeric"
            defaultValue={assumptions.expected_growth}
            style={fieldInputStyle}
          />
          <p style={hintStyle}>
            People expected to arrive by the date below. Use a negative number
            if you expect shrinkage.
          </p>
        </div>

        <div>
          <label htmlFor="expected_growth_date" style={fieldLabelStyle}>
            Expected growth date
          </label>
          <input
            ref={growthDateRef}
            id="expected_growth_date"
            name="expected_growth_date"
            type="date"
            defaultValue={assumptions.expected_growth_date ?? ""}
            style={fieldInputStyle}
          />
          <div
            style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}
          >
            <button
              type="button"
              onClick={() => {
                if (growthDateRef.current) {
                  growthDateRef.current.value = nextSeasonAnchorIso(8);
                }
              }}
              style={seasonButtonStyle}
            >
              Next August
            </button>
            <button
              type="button"
              onClick={() => {
                if (growthDateRef.current) {
                  growthDateRef.current.value = nextSeasonAnchorIso(1);
                }
              }}
              style={seasonButtonStyle}
            >
              Next January
            </button>
          </div>
          <p style={hintStyle}>
            Optional. Used to suggest launch timing. Julian&rsquo;s planting
            seasons are August (primary) and January.
          </p>
        </div>

        <div>
          <label
            htmlFor="target_group_participation_pct"
            style={fieldLabelStyle}
          >
            Target group participation %
          </label>
          <input
            id="target_group_participation_pct"
            name="target_group_participation_pct"
            type="number"
            min={0}
            max={1}
            step={0.01}
            inputMode="decimal"
            defaultValue={assumptions.target_group_participation_pct}
            style={fieldInputStyle}
          />
          <p style={hintStyle}>
            Decimal 0–1. e.g. 0.6 means 60% of attendees should be in a Life
            Group ({pctValue(assumptions.target_group_participation_pct)}%
            today).
          </p>
        </div>

        <div>
          <label htmlFor="average_group_size" style={fieldLabelStyle}>
            Average group size
          </label>
          <input
            id="average_group_size"
            name="average_group_size"
            type="number"
            min={1}
            max={500}
            inputMode="numeric"
            defaultValue={assumptions.average_group_size}
            style={fieldInputStyle}
          />
          <p style={hintStyle}>
            Used to divide the capacity gap into new-group count. Defaults to
            the ministry-wide default capacity when blank.
          </p>
        </div>

        <div>
          <label htmlFor="launch_buffer_pct" style={fieldLabelStyle}>
            Launch buffer %
          </label>
          <input
            id="launch_buffer_pct"
            name="launch_buffer_pct"
            type="number"
            min={0}
            max={0.95}
            step={0.01}
            inputMode="decimal"
            defaultValue={assumptions.launch_buffer_pct}
            style={fieldInputStyle}
          />
          <p style={hintStyle}>
            Decimal 0–0.95. Headroom above projected demand. e.g. 0.15 reserves
            15% spare capacity ({pctValue(assumptions.launch_buffer_pct)}%
            today).
          </p>
        </div>

        <div>
          <label htmlFor="leaders_per_new_group" style={fieldLabelStyle}>
            Leaders per new group
          </label>
          <input
            id="leaders_per_new_group"
            name="leaders_per_new_group"
            type="number"
            min={0}
            max={10}
            inputMode="numeric"
            defaultValue={assumptions.leaders_per_new_group}
            style={fieldInputStyle}
          />
          <p style={hintStyle}>e.g. 2 = one leader + one co-leader.</p>
        </div>
      </div>

      <div>
        <label htmlFor="notes" style={fieldLabelStyle}>
          Planning notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={assumptions.notes ?? ""}
          style={{
            ...fieldInputStyle,
            minHeight: 80,
            resize: "vertical",
            fontFamily: fontBody,
          }}
          placeholder="Optional context for Julian's eyes only."
        />
        <p style={hintStyle}>
          Admin-only. Not shown anywhere outside this page and never logged in
          audit metadata.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save assumptions"}
        </PButton>
        {state?.ok ? (
          <span style={successTextStyle}>Assumptions saved.</span>
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

const seasonButtonStyle = {
  fontFamily: fontBody,
  fontSize: 11,
  color: P.ink2,
  background: P.bg,
  border: `1px solid ${P.line}`,
  borderRadius: 999,
  padding: "3px 10px",
  cursor: "pointer",
} as const;
