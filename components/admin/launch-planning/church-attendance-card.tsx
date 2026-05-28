"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminRecordChurchAttendanceSnapshot } from "@/app/(protected)/admin/launch-planning/actions";
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
  // Latest recorded church attendance, or null when none recorded yet.
  latest: { snapshotDate: string; attendanceCount: number } | null;
  // People currently in active life groups (the numerator).
  currentParticipants: number;
  // current_participants / latest church attendance, rounded, or null.
  participationPct: number | null;
  // Today (YYYY-MM-DD) for the default date input value.
  todayIso: string;
};

export function ChurchAttendanceCard({
  latest,
  currentParticipants,
  participationPct,
  todayIso,
}: ChurchAttendanceCardProps) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminRecordChurchAttendanceSnapshot,
    undefined,
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

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <span style={{ fontFamily: fontBody, fontSize: 34, fontWeight: 600, color: P.ink }}>
          {participationPct == null ? "—" : `${participationPct}%`}
        </span>
        <span style={{ fontFamily: fontBody, fontSize: 13, color: P.ink2 }}>
          {currentParticipants} in groups
          {latest ? ` of ${latest.attendanceCount} attending` : ""}
        </span>
      </div>
      <p style={{ margin: "0 0 18px", fontFamily: fontBody, fontSize: 12, color: P.ink3 }}>
        {latest
          ? `Latest church attendance recorded ${latest.snapshotDate}.`
          : "No church attendance recorded yet. Add a count below to start tracking the percentage in a group."}
      </p>

      <form action={formAction} style={{ display: "grid", gap: 12 }}>
        <div
          className="lg-m-grid-stack"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div>
            <label htmlFor="snapshot_date" style={fieldLabelStyle}>
              Date
            </label>
            <input
              id="snapshot_date"
              name="snapshot_date"
              type="date"
              defaultValue={latest?.snapshotDate ?? todayIso}
              style={fieldInputStyle}
            />
          </div>
          <div>
            <label htmlFor="attendance_count" style={fieldLabelStyle}>
              Attendance count
            </label>
            <input
              id="attendance_count"
              name="attendance_count"
              type="number"
              min={0}
              max={1000000}
              inputMode="numeric"
              defaultValue={latest?.attendanceCount ?? ""}
              placeholder="e.g. 100"
              style={fieldInputStyle}
            />
          </div>
        </div>
        <div>
          <label htmlFor="note" style={fieldLabelStyle}>
            Note (optional)
          </label>
          <input
            id="note"
            name="note"
            type="text"
            maxLength={1000}
            placeholder="e.g. Easter Sunday, estimate"
            style={fieldInputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <PButton type="submit" tone="terra" size="md" disabled={pending}>
            {pending ? "Saving…" : "Record attendance"}
          </PButton>
          {state?.ok ? <span style={successTextStyle}>Attendance recorded.</span> : null}
        </div>
        {state && !state.ok ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
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
