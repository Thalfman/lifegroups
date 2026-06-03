"use client";

// PRD-SAC6 Feature 1 (#288): the Danger-Zone Clean Slate card. Shows a
// server-loaded impact preview (current per-table history counts) and gates the
// history-only wipe behind a CLEAR HISTORY type-to-confirm phrase — the submit
// stays disabled until the exact phrase is typed, and the phrase is re-checked
// server-side in the action.

import { useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { superAdminCleanSlateWipe } from "@/app/(protected)/admin/super-admin/clean-slate-actions";
import {
  CLEAN_SLATE_CONFIRM_PHRASE,
  type CleanSlateWipeSuccess,
} from "@/lib/admin/danger-zone";
import type { CleanSlateImpact } from "@/lib/supabase/maintenance-reads";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  fieldInputClass,
  fieldInputStyle,
  fieldLabelStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";

// Human-readable labels for the history tables shown in the impact preview.
const TABLE_LABELS: Record<string, string> = {
  attendance_sessions: "Attendance sessions",
  attendance_records: "Attendance records",
  guests: "Guests",
  follow_ups: "Follow-ups",
  group_health_assessments: "Group health assessments",
  group_health_updates: "Group health updates",
  group_status_history: "Group status history",
  church_attendance_snapshots: "Church attendance snapshots",
  shepherd_care_interactions: "Shepherd-care interactions",
  shepherd_care_follow_ups: "Shepherd-care follow-ups",
};

export function CleanSlateCard({
  impact,
}: {
  impact: CleanSlateImpact | null;
}) {
  const { state, formAction, pending } = useActionForm<CleanSlateWipeSuccess>(
    superAdminCleanSlateWipe
  );
  const [confirm, setConfirm] = useState("");

  const phraseMatches = confirm.trim() === CLEAN_SLATE_CONFIRM_PHRASE;
  const nothingToWipe = impact !== null && impact.total === 0;
  const entries = impact
    ? Object.entries(impact.counts).filter(([, n]) => n > 0)
    : [];

  return (
    <div
      style={{
        background: P.terraSoft,
        border: `1px solid ${P.terra}`,
        borderRadius: 10,
        padding: "18px 22px",
        display: "grid",
        gap: 12,
      }}
    >
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 18,
          fontWeight: 600,
          color: P.ink,
          margin: 0,
        }}
      >
        Clean Slate — clear history
      </h3>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.terraTextStrong,
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        Permanently clears accumulated history (attendance, follow-ups, guests,
        group-health, status history, church-attendance snapshots, and
        shepherd-care activity). People, groups, leaders, memberships, settings,
        care profiles &amp; notes, and the audit log are kept. A recoverable
        snapshot is captured before anything is deleted.
      </p>

      {/* Impact preview — what would be cleared right now. */}
      {impact === null ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink2,
            margin: 0,
          }}
        >
          Impact preview unavailable — the history counts couldn&rsquo;t be
          loaded. The wipe is disabled until they read successfully.
        </p>
      ) : nothingToWipe ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink2,
            margin: 0,
          }}
        >
          Nothing to clear — there is no accumulated history right now.
        </p>
      ) : (
        <div
          style={{
            border: `1px solid ${P.line}`,
            borderRadius: 8,
            background: P.surface,
            padding: "10px 12px",
            display: "grid",
            gap: 6,
          }}
        >
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 700,
            }}
          >
            Will clear {impact.total} row{impact.total === 1 ? "" : "s"}
          </div>
          {entries.map(([table, n]) => (
            <div
              key={table}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                fontFamily: fontSans,
                fontSize: 12,
                color: P.ink2,
              }}
            >
              <span>{TABLE_LABELS[table] ?? table}</span>
              <strong style={{ color: P.ink }}>{n}</strong>
            </div>
          ))}
        </div>
      )}

      <form action={formAction} style={{ display: "grid", gap: 10 }}>
        <div>
          <label htmlFor="clean-slate-confirm" style={fieldLabelStyle}>
            Type {CLEAN_SLATE_CONFIRM_PHRASE} to confirm
          </label>
          <input
            id="clean-slate-confirm"
            name="confirm"
            type="text"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={CLEAN_SLATE_CONFIRM_PHRASE}
            className={fieldInputClass}
            style={fieldInputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <PButton
            type="submit"
            tone="terra"
            size="md"
            disabled={
              pending || !phraseMatches || impact === null || nothingToWipe
            }
          >
            {pending ? "Clearing…" : "Clear history"}
          </PButton>
          {state?.ok ? (
            <span style={successTextStyle}>
              Cleared {state.value.totalRows} row
              {state.value.totalRows === 1 ? "" : "s"}. A snapshot was saved for
              recovery.
            </span>
          ) : null}
        </div>
        <FormStatus state={state} />
      </form>
    </div>
  );
}
