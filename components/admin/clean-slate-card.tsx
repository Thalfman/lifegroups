"use client";

// PRD-SAC6 Feature 1 (#288): the Danger-Zone Clean Slate card. Shows a
// server-loaded impact preview (current per-table history counts) and gates the
// history-only wipe behind a CLEAR HISTORY type-to-confirm phrase — the submit
// stays disabled until the exact phrase is typed, and the phrase is re-checked
// server-side in the action.

import { useEffect, useState } from "react";
import { PButton, pButtonStyle } from "@/components/pastoral/button";
import {
  superAdminCleanSlateWipe,
  superAdminCleanSlateRevert,
  superAdminCleanSlateImport,
} from "@/app/(protected)/admin/super-admin/clean-slate-actions";
import {
  CLEAN_SLATE_CONFIRM_PHRASE,
  CLEAN_SLATE_RESTORE_CONFIRM_PHRASE,
  type CleanSlateWipeSuccess,
  type CleanSlateRevertSuccess,
  type CleanSlateImportSuccess,
} from "@/lib/admin/danger-zone";
import type {
  CleanSlateImpact,
  CleanSlateLatestSnapshot,
} from "@/lib/supabase/maintenance-reads";
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

// Format a snapshot's capture time for the recovery section. Fixed locale +
// UTC so server and client render the same string (no hydration mismatch).
function formatSnapshotTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function CleanSlateCard({
  impact,
  snapshot,
}: {
  impact: CleanSlateImpact | null;
  snapshot: CleanSlateLatestSnapshot | null;
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
            state.value.nothingToClear ? (
              <span
                style={{ fontFamily: fontBody, fontSize: 13, color: P.ink2 }}
              >
                Already clear — there was no accumulated history to clear.
              </span>
            ) : (
              <span style={successTextStyle}>
                Cleared {state.value.totalRows} row
                {state.value.totalRows === 1 ? "" : "s"}. A snapshot was saved
                for recovery.
              </span>
            )
          ) : null}
        </div>
        <FormStatus state={state} />
      </form>

      <CleanSlateRecovery snapshot={snapshot} />
    </div>
  );
}

// Recovery (#293 revert + #294 export/import): restore the captured snapshot
// back into an empty database. Revert reads the in-DB snapshot; Export saves it
// to a file; Import restores from a previously exported file (the only path once
// the in-DB snapshot is gone). Revert + Import are gated behind the RESTORE
// type-to-confirm phrase; all restores require an empty target (target_not_empty).
function CleanSlateRecovery({
  snapshot,
}: {
  snapshot: CleanSlateLatestSnapshot | null;
}) {
  const revert = useActionForm<CleanSlateRevertSuccess>(
    superAdminCleanSlateRevert,
    { resetOnSuccess: true }
  );
  const importForm = useActionForm<CleanSlateImportSuccess>(
    superAdminCleanSlateImport,
    { resetOnSuccess: true }
  );
  const [revertConfirm, setRevertConfirm] = useState("");
  const [importConfirm, setImportConfirm] = useState("");

  // resetOnSuccess clears the uncontrolled file input via formRef; the
  // controlled confirm fields must be cleared by hand. Clearing both after a
  // successful restore stops an accidental immediate resubmit (which would hit
  // target_not_empty and read like a fresh failure).
  const revertOk = revert.state?.ok;
  const importOk = importForm.state?.ok;
  useEffect(() => {
    if (revertOk) setRevertConfirm("");
  }, [revertOk]);
  useEffect(() => {
    if (importOk) setImportConfirm("");
  }, [importOk]);

  const revertMatches =
    revertConfirm.trim() === CLEAN_SLATE_RESTORE_CONFIRM_PHRASE;
  const importMatches =
    importConfirm.trim() === CLEAN_SLATE_RESTORE_CONFIRM_PHRASE;
  const hasSnapshot = snapshot !== null;

  return (
    <div
      style={{
        borderTop: `1px solid ${P.terra}`,
        paddingTop: 14,
        display: "grid",
        gap: 12,
      }}
    >
      <h4
        style={{
          fontFamily: fontDisplay,
          fontSize: 15,
          fontWeight: 600,
          color: P.ink,
          margin: 0,
        }}
      >
        Recover a snapshot
      </h4>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.terraTextStrong,
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        Restore the most recent snapshot back into the database. Restoring needs
        an empty target — clear history first if rows have been added since.
        Export the snapshot to a file first if you want to keep a copy before
        restoring, or import a previously exported file.
      </p>

      {/* Latest snapshot summary. */}
      {hasSnapshot ? (
        <div
          style={{
            border: `1px solid ${P.line}`,
            borderRadius: 8,
            background: P.surface,
            padding: "10px 12px",
            display: "grid",
            gap: 4,
            fontFamily: fontSans,
            fontSize: 12,
            color: P.ink2,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>Snapshot captured</span>
            <strong style={{ color: P.ink }}>
              {formatSnapshotTime(snapshot.createdAt)} UTC
            </strong>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>Rows in snapshot</span>
            <strong style={{ color: P.ink }}>{snapshot.totalRows}</strong>
          </div>
        </div>
      ) : (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink2,
            margin: 0,
          }}
        >
          No recoverable snapshot — nothing has been cleared, or the last
          snapshot was already restored. You can still import a snapshot file
          below.
        </p>
      )}

      {/* Revert + Export row. */}
      <form
        ref={revert.formRef}
        action={revert.formAction}
        style={{ display: "grid", gap: 10 }}
      >
        {/* Bind the revert to the snapshot the operator actually sees. A stale
            tab whose snapshot was replaced by a later wipe then fails with
            missing_snapshot rather than silently restoring a different one. */}
        {hasSnapshot ? (
          <input type="hidden" name="snapshotId" value={snapshot.id} />
        ) : null}
        <div>
          <label htmlFor="clean-slate-revert-confirm" style={fieldLabelStyle}>
            Type {CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} to confirm
          </label>
          <input
            id="clean-slate-revert-confirm"
            name="confirm"
            type="text"
            autoComplete="off"
            value={revertConfirm}
            onChange={(e) => setRevertConfirm(e.target.value)}
            placeholder={CLEAN_SLATE_RESTORE_CONFIRM_PHRASE}
            className={fieldInputClass}
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
          <PButton
            type="submit"
            tone="terra"
            size="md"
            disabled={revert.pending || !revertMatches || !hasSnapshot}
          >
            {revert.pending ? "Restoring…" : "Revert from snapshot"}
          </PButton>
          {hasSnapshot ? (
            <a
              href={`/admin/super-admin/clean-slate/export/${snapshot.id}`}
              rel="nofollow noreferrer"
              style={pButtonStyle("ghost", "md")}
            >
              Export snapshot file
            </a>
          ) : null}
          {revert.state?.ok ? (
            <span style={successTextStyle}>
              Restored {revert.state.value.totalRows} row
              {revert.state.value.totalRows === 1 ? "" : "s"} from the snapshot.
            </span>
          ) : null}
        </div>
        <FormStatus state={revert.state} />
      </form>

      {/* Import-from-file. */}
      <form
        ref={importForm.formRef}
        action={importForm.formAction}
        style={{ display: "grid", gap: 10 }}
      >
        <div>
          <label htmlFor="clean-slate-import-file" style={fieldLabelStyle}>
            Import a snapshot file
          </label>
          <input
            id="clean-slate-import-file"
            name="file"
            type="file"
            accept="application/json,.json"
            style={{ fontFamily: fontSans, fontSize: 12, color: P.ink2 }}
          />
        </div>
        <div>
          <label htmlFor="clean-slate-import-confirm" style={fieldLabelStyle}>
            Type {CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} to confirm
          </label>
          <input
            id="clean-slate-import-confirm"
            name="confirm"
            type="text"
            autoComplete="off"
            value={importConfirm}
            onChange={(e) => setImportConfirm(e.target.value)}
            placeholder={CLEAN_SLATE_RESTORE_CONFIRM_PHRASE}
            className={fieldInputClass}
            style={fieldInputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <PButton
            type="submit"
            tone="terra"
            size="md"
            disabled={importForm.pending || !importMatches}
          >
            {importForm.pending ? "Importing…" : "Import snapshot file"}
          </PButton>
          {importForm.state?.ok ? (
            <span style={successTextStyle}>
              Imported {importForm.state.value.totalRows} row
              {importForm.state.value.totalRows === 1 ? "" : "s"} from the file.
            </span>
          ) : null}
        </div>
        <FormStatus state={importForm.state} />
      </form>
    </div>
  );
}
