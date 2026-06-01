"use client";

import { PButton } from "@/components/pastoral/button";
import { adminUpdateLaunchPlanningAssumptions } from "@/app/(protected)/admin/launch-planning/actions";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import {
  fieldInputStyle,
  fieldLabelStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";

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
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateLaunchPlanningAssumptions
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
          {currentParticipants} in groups
          {currentChurchAttendance > 0
            ? ` of ${currentChurchAttendance} attending`
            : ""}
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
            // Required: this is a forecast input with no "blank = clear"
            // meaning. A blank submit would be dropped by readLaunchPlanningForm
            // and rejected with a misleading "Nothing to change", so block it at
            // the browser instead with a clear native prompt.
            required
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
          <FormStatus state={state} successText="Saved." />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <FormStatus state={state} />
        </div>
      </form>
    </section>
  );
}
