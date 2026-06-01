"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminUpdateLaunchPlanningAssumptions } from "@/app/(protected)/admin/launch-planning/actions";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

export type ChurchAttendanceCardProps = {
  // L4 (#223): the single source of truth for the headline denominator — the
  // editable `current_church_attendance` assumption, not a time series.
  currentChurchAttendance: number;
  // People currently in active life groups (the numerator).
  currentParticipants: number;
  // current_participants / current_church_attendance, rounded, or null.
  participationPct: number | null;
};

export function ChurchAttendanceCard({
  currentChurchAttendance,
  currentParticipants,
  participationPct,
}: ChurchAttendanceCardProps) {
  // L4 (#223): editing church attendance writes the single
  // `current_church_attendance` assumption (the same key the assumptions form
  // and forecast read). The RPC merges only submitted keys, so posting just
  // this one field leaves every other assumption untouched.
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminUpdateLaunchPlanningAssumptions,
    undefined
  );

  return (
    <section
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "22px 24px",
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
          }}
        >
          Church attendance
        </span>
        <h2
          style={{
            margin: "4px 0 0",
            fontFamily: fontBody,
            fontSize: 18,
            color: P.ink,
            fontWeight: 600,
          }}
        >
          % of the church in a group
        </h2>
      </header>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: fontBody,
            fontSize: 34,
            fontWeight: 600,
            color: P.ink,
          }}
        >
          {participationPct == null ? "—" : `${participationPct}%`}
        </span>
        <span style={{ fontFamily: fontBody, fontSize: 13, color: P.ink2 }}>
          {currentParticipants} in groups of {currentChurchAttendance} attending
        </span>
      </div>
      <p
        style={{
          margin: "0 0 18px",
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink3,
        }}
      >
        Update the current church attendance to keep this percentage — and the
        launch forecast — accurate.
      </p>

      <form
        action={formAction}
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 200px) auto",
          gap: 12,
          alignItems: "end",
        }}
      >
        <div>
          <label htmlFor="current_church_attendance" style={fieldLabelStyle}>
            Current church attendance
          </label>
          <input
            id="current_church_attendance"
            name="current_church_attendance"
            type="number"
            min={0}
            max={100000}
            inputMode="numeric"
            defaultValue={currentChurchAttendance}
            style={fieldInputStyle}
          />
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
            {pending ? "Saving…" : "Save"}
          </PButton>
          {state?.ok ? <span style={successTextStyle}>Saved.</span> : null}
        </div>
        {state && !state.ok ? (
          <ul
            style={{
              gridColumn: "1 / -1",
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
    </section>
  );
}
