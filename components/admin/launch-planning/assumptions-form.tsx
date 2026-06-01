"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminUpdateLaunchPlanningAssumptions } from "@/app/(protected)/admin/launch-planning/actions";
import { P, fontBody } from "@/lib/pastoral";
import { PercentField } from "@/components/admin/launch-planning/percent-field";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import { ratioToPercent } from "@/lib/admin/launch-planning";
import type { ActionResult } from "@/lib/admin/action-result";
import type { LaunchPlanningAssumptions } from "@/lib/admin/launch-planning";

type State = ActionResult<{ id: string }> | undefined;

// L5 (#224): the default forecast asks only for the two inputs that need a
// ministry-specific answer — current church attendance (set in the Church
// attendance card) and target group participation, shown as a percentage. The
// rest (growth, average group size, launch buffer, leaders per new group) are
// silently defaulted and remain editable per scenario in the Scenarios tab.
export function LaunchPlanningAssumptionsForm({
  assumptions,
}: {
  assumptions: LaunchPlanningAssumptions;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminUpdateLaunchPlanningAssumptions,
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
        Set the share of attendees you want in a Life Group. Current church
        attendance is set in the Church attendance card above; growth, group
        size, buffer, and leaders per group use sensible defaults you can
        fine-tune per scenario. Leave a field blank to keep its current value.
      </p>

      <PercentField
        id="target_group_participation_pct"
        name="target_group_participation_pct"
        label="Target group participation %"
        defaultRatio={assumptions.target_group_participation_pct}
        maxPercent={100}
        hint={
          <>
            Share of attendees you want in a Life Group — e.g. 60 means 60% (
            {`${ratioToPercent(assumptions.target_group_participation_pct)}%`}{" "}
            today).
          </>
        }
      />

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
          {pending ? "Saving…" : "Save forecast"}
        </PButton>
        {state?.ok ? (
          <span style={successTextStyle}>Forecast saved.</span>
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
