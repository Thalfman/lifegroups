"use client";

// PRD-SAC6 Feature 1 (#288): the Danger-Zone Clean Slate card. Shows a
// server-loaded impact preview (current per-table history counts) and gates the
// history-only wipe behind a CLEAR HISTORY type-to-confirm phrase — the submit
// stays disabled until the exact phrase is typed, and the phrase is re-checked
// server-side in the action. The recovery controls (revert / export / import)
// live in a visually separated panel so they never read as part of the wipe.

import { useState } from "react";
import { Button, buttonClassName } from "@/components/ui/button";
import { useValueChange } from "@/lib/hooks/use-value-change";
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
  fieldInputClassName,
  fieldLabelClassName,
  successTextClassName,
} from "@/components/admin/forms/field-styles";
import {
  DangerCard,
  DangerSection,
} from "@/components/admin/danger-zone-card-shell";
import { formatIsoDateTimeUtc } from "@/lib/shared/date";

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

  const destructiveStatus =
    impact === null
      ? ({ label: "Locked", tone: "locked" } as const)
      : nothingToWipe
        ? ({ label: "Nothing to clear", tone: "info" } as const)
        : ({ label: "Requires confirmation", tone: "confirm" } as const);

  return (
    <DangerCard
      title="Clean Slate — clear history"
      intro="Permanently clears accumulated history (attendance, follow-ups, guests, group-health, status history, church-attendance snapshots, and shepherd-care activity). People, groups, leaders, memberships, settings, care profiles & notes, and the audit log are kept. A recoverable snapshot is captured before anything is deleted."
    >
      <DangerSection
        variant="destructive"
        label="Clear history"
        status={destructiveStatus}
      >
        {/* Impact preview — what would be cleared right now. */}
        {impact === null ? (
          <p className="m-0 font-sans text-sm text-ink2">
            Impact preview unavailable — the history counts couldn&rsquo;t be
            loaded. The wipe is disabled until they read successfully.
          </p>
        ) : nothingToWipe ? (
          <p className="m-0 font-sans text-sm text-ink2">
            Nothing to clear — there is no accumulated history right now.
          </p>
        ) : (
          <div className="grid gap-1.5 rounded-sm border border-line bg-surfaceAlt px-3 py-2.5">
            <div className="font-sans text-xs font-semibold text-ink3">
              Will clear {impact.total} row{impact.total === 1 ? "" : "s"}
            </div>
            {entries.map(([table, n]) => (
              <div
                key={table}
                className="flex justify-between gap-3 font-sans text-xs text-ink2"
              >
                <span>{TABLE_LABELS[table] ?? table}</span>
                <strong className="text-ink">{n}</strong>
              </div>
            ))}
          </div>
        )}

        <form action={formAction} className="grid gap-2.5">
          <div>
            <label
              htmlFor="clean-slate-confirm"
              className={fieldLabelClassName}
            >
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
              className={fieldInputClassName}
            />
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              type="submit"
              variant="destructive"
              size="md"
              disabled={
                pending || !phraseMatches || impact === null || nothingToWipe
              }
            >
              {pending ? "Clearing…" : "Clear history"}
            </Button>
            {state?.ok ? (
              state.value.nothingToClear ? (
                <span className="font-sans text-sm text-ink2">
                  Already clear — there was no accumulated history to clear.
                </span>
              ) : (
                <span className={successTextClassName}>
                  Cleared {state.value.totalRows} row
                  {state.value.totalRows === 1 ? "" : "s"}. A snapshot was saved
                  for recovery.
                </span>
              )
            ) : null}
          </div>
          <FormStatus state={state} />
        </form>
      </DangerSection>

      <CleanSlateRecovery snapshot={snapshot} />
    </DangerCard>
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
  // Pull formRef out of each returned object: reading a ref member during render
  // (here, to bind the <form>) otherwise trips react-hooks/refs for every access
  // on the object. The rest keeps the `.state` / `.pending` call sites.
  const { formRef: revertFormRef, ...revert } =
    useActionForm<CleanSlateRevertSuccess>(superAdminCleanSlateRevert, {
      resetOnSuccess: true,
    });
  const { formRef: importFormRef, ...importForm } =
    useActionForm<CleanSlateImportSuccess>(superAdminCleanSlateImport, {
      resetOnSuccess: true,
    });
  const [revertConfirm, setRevertConfirm] = useState("");
  const [importConfirm, setImportConfirm] = useState("");

  // resetOnSuccess clears the uncontrolled file input via formRef; the
  // controlled confirm fields must be cleared by hand. Clearing both after a
  // successful restore stops an accidental immediate resubmit (which would hit
  // target_not_empty and read like a fresh failure).
  // Derived during render rather than in an effect to avoid the cascading-render
  // smell.
  const revertOk = revert.state?.ok;
  const importOk = importForm.state?.ok;
  useValueChange(revertOk, (ok) => {
    if (ok) setRevertConfirm("");
  });
  useValueChange(importOk, (ok) => {
    if (ok) setImportConfirm("");
  });

  const revertMatches =
    revertConfirm.trim() === CLEAN_SLATE_RESTORE_CONFIRM_PHRASE;
  const importMatches =
    importConfirm.trim() === CLEAN_SLATE_RESTORE_CONFIRM_PHRASE;
  const hasSnapshot = snapshot !== null;

  return (
    <DangerSection
      variant="recovery"
      label="Recover a snapshot"
      status={
        hasSnapshot
          ? { label: "Reversible", tone: "reversible" }
          : { label: "No snapshot", tone: "info" }
      }
      description="Restore the most recent snapshot back into the database. Restoring needs an empty target — clear history first if rows have been added since. Export the snapshot to a file first if you want to keep a copy before restoring, or import a previously exported file."
    >
      {/* Latest snapshot summary. */}
      {hasSnapshot ? (
        <div className="grid gap-1 rounded-sm border border-line bg-surface px-3 py-2.5 font-sans text-xs text-ink2">
          <div className="flex justify-between gap-3">
            <span>Snapshot captured</span>
            <strong className="text-ink">
              {formatIsoDateTimeUtc(snapshot.createdAt)} UTC
            </strong>
          </div>
          <div className="flex justify-between gap-3">
            <span>Rows in snapshot</span>
            <strong className="text-ink">{snapshot.totalRows}</strong>
          </div>
        </div>
      ) : (
        <p className="m-0 font-sans text-sm text-ink2">
          No recoverable snapshot — nothing has been cleared, or the last
          snapshot was already restored. You can still import a snapshot file
          below.
        </p>
      )}

      {/* Revert + Export row. */}
      <form
        ref={revertFormRef}
        action={revert.formAction}
        className="grid gap-2.5"
      >
        {/* Bind the revert to the snapshot the operator actually sees. A stale
            tab whose snapshot was replaced by a later wipe then fails with
            missing_snapshot rather than silently restoring a different one. */}
        {hasSnapshot ? (
          <input type="hidden" name="snapshotId" value={snapshot.id} />
        ) : null}
        <div>
          <label
            htmlFor="clean-slate-revert-confirm"
            className={fieldLabelClassName}
          >
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
            className={fieldInputClassName}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="submit"
            variant="solid"
            size="md"
            disabled={revert.pending || !revertMatches || !hasSnapshot}
          >
            {revert.pending ? "Restoring…" : "Revert from snapshot"}
          </Button>
          {hasSnapshot ? (
            <a
              href={`/admin/super-admin/clean-slate/export/${snapshot.id}`}
              rel="nofollow noreferrer"
              className={buttonClassName("ghost", "md")}
            >
              Export snapshot file
            </a>
          ) : null}
          {revert.state?.ok ? (
            <span className={successTextClassName}>
              Restored {revert.state.value.totalRows} row
              {revert.state.value.totalRows === 1 ? "" : "s"} from the snapshot.
            </span>
          ) : null}
        </div>
        <FormStatus state={revert.state} />
      </form>

      {/* Import-from-file. */}
      <form
        ref={importFormRef}
        action={importForm.formAction}
        className="grid gap-2.5"
      >
        <div>
          <label
            htmlFor="clean-slate-import-file"
            className={fieldLabelClassName}
          >
            Import a snapshot file
          </label>
          <input
            id="clean-slate-import-file"
            name="file"
            type="file"
            accept="application/json,.json"
            className="font-sans text-xs text-ink2"
          />
        </div>
        <div>
          <label
            htmlFor="clean-slate-import-confirm"
            className={fieldLabelClassName}
          >
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
            className={fieldInputClassName}
          />
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            type="submit"
            variant="solid"
            size="md"
            disabled={importForm.pending || !importMatches}
          >
            {importForm.pending ? "Importing…" : "Import snapshot file"}
          </Button>
          {importForm.state?.ok ? (
            <span className={successTextClassName}>
              Imported {importForm.state.value.totalRows} row
              {importForm.state.value.totalRows === 1 ? "" : "s"} from the file.
            </span>
          ) : null}
        </div>
        <FormStatus state={importForm.state} />
      </form>
    </DangerSection>
  );
}
