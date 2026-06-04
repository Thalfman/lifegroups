"use client";

// PRD-SAC6 follow-up: the Danger-Zone "Reset by category" card. Lists each
// history category with its current row count and a type-to-confirm Reset that
// clears just that category (capturing a recoverable snapshot first). Each
// category that has an un-restored snapshot also shows a Revert. Mirrors the
// Clean Slate card's gating: the submit stays disabled until the exact phrase is
// typed, and the phrase is re-checked server-side in the action.

import { useEffect, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  superAdminResetHistoryCategory,
  superAdminResetHistoryCategoryRevert,
} from "@/app/(protected)/admin/super-admin/history-reset-actions";
import {
  HISTORY_RESET_CONFIRM_PHRASE,
  CLEAN_SLATE_RESTORE_CONFIRM_PHRASE,
  type HistoryResetSuccess,
  type HistoryResetRevertSuccess,
} from "@/lib/admin/danger-zone";
import { HISTORY_RESET_CATEGORY_META } from "@/lib/admin/history-reset";
import type {
  HistoryResetState,
  HistoryResetCategoryState,
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

// Fixed locale + UTC so server and client render the same string (no hydration
// mismatch). Mirrors the Clean Slate card's snapshot formatter.
function formatSnapshotTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function HistoryResetCard({
  state,
}: {
  state: HistoryResetState | null;
}) {
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
        Reset by category — clear one kind of history
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
        Clear a single category of accumulated history at a time — useful before
        launch to remove invalid test data without wiping everything. Each reset
        captures a recoverable snapshot of just that category before deleting,
        and is audited. People, groups, leaders, memberships, settings, and
        other categories are untouched. To clear every category at once, use
        Clean Slate above instead.
      </p>

      {state === null ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink2,
            margin: 0,
          }}
        >
          Impact preview unavailable — the per-category counts couldn&rsquo;t be
          loaded. Resets are disabled until they read successfully.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {state.categories.map((category) => (
            <CategoryResetRow key={category.category} category={category} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryResetRow({
  category,
}: {
  category: HistoryResetCategoryState;
}) {
  const reset = useActionForm<HistoryResetSuccess>(
    superAdminResetHistoryCategory
  );
  const revert = useActionForm<HistoryResetRevertSuccess>(
    superAdminResetHistoryCategoryRevert,
    { resetOnSuccess: true }
  );
  const [confirm, setConfirm] = useState("");
  const [restoreConfirm, setRestoreConfirm] = useState("");

  // Clear the controlled restore field after a successful revert so an
  // accidental resubmit doesn't immediately trip target_not_empty.
  const revertOk = revert.state?.ok;
  useEffect(() => {
    if (revertOk) setRestoreConfirm("");
  }, [revertOk]);

  const meta = HISTORY_RESET_CATEGORY_META[category.category];
  const nothingToReset = category.count === 0;
  const phraseMatches = confirm.trim() === HISTORY_RESET_CONFIRM_PHRASE;
  const restoreMatches =
    restoreConfirm.trim() === CLEAN_SLATE_RESTORE_CONFIRM_PHRASE;
  const snapshot = category.snapshot;

  return (
    <div
      style={{
        border: `1px solid ${P.line}`,
        borderRadius: 8,
        background: P.surface,
        padding: "12px 14px",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 13,
              fontWeight: 700,
              color: P.ink,
            }}
          >
            {meta.label}
          </div>
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink2,
              margin: "2px 0 0",
              lineHeight: 1.45,
            }}
          >
            {meta.description}
          </p>
        </div>
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 12,
            color: P.ink2,
            whiteSpace: "nowrap",
          }}
        >
          {nothingToReset ? (
            "No rows"
          ) : (
            <>
              <strong style={{ color: P.ink }}>{category.count}</strong> row
              {category.count === 1 ? "" : "s"}
            </>
          )}
        </div>
      </div>

      <form action={reset.formAction} style={{ display: "grid", gap: 8 }}>
        <input type="hidden" name="category" value={category.category} />
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 180px", minWidth: 160 }}>
            <label
              htmlFor={`history-reset-confirm-${category.category}`}
              style={fieldLabelStyle}
            >
              Type {HISTORY_RESET_CONFIRM_PHRASE} to confirm
            </label>
            <input
              id={`history-reset-confirm-${category.category}`}
              name="confirm"
              type="text"
              autoComplete="off"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={HISTORY_RESET_CONFIRM_PHRASE}
              className={fieldInputClass}
              style={fieldInputStyle}
              disabled={nothingToReset}
            />
          </div>
          <PButton
            type="submit"
            tone="terra"
            size="sm"
            disabled={reset.pending || !phraseMatches || nothingToReset}
          >
            {reset.pending ? "Clearing…" : "Reset"}
          </PButton>
        </div>
        {reset.state?.ok ? (
          <span style={successTextStyle}>
            Cleared {reset.state.value.totalRows} row
            {reset.state.value.totalRows === 1 ? "" : "s"}. A snapshot was saved
            for recovery.
          </span>
        ) : null}
        <FormStatus state={reset.state} />
      </form>

      {snapshot ? (
        <form
          ref={revert.formRef}
          action={revert.formAction}
          style={{
            display: "grid",
            gap: 8,
            borderTop: `1px solid ${P.line}`,
            paddingTop: 10,
          }}
        >
          <input type="hidden" name="snapshotId" value={snapshot.id} />
          <div style={{ fontFamily: fontSans, fontSize: 12, color: P.ink2 }}>
            Recoverable snapshot: {snapshot.totalRows} row
            {snapshot.totalRows === 1 ? "" : "s"} captured{" "}
            {formatSnapshotTime(snapshot.createdAt)} UTC.
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 180px", minWidth: 160 }}>
              <label
                htmlFor={`history-restore-confirm-${category.category}`}
                style={fieldLabelStyle}
              >
                Type {CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} to restore
              </label>
              <input
                id={`history-restore-confirm-${category.category}`}
                name="confirm"
                type="text"
                autoComplete="off"
                value={restoreConfirm}
                onChange={(e) => setRestoreConfirm(e.target.value)}
                placeholder={CLEAN_SLATE_RESTORE_CONFIRM_PHRASE}
                className={fieldInputClass}
                style={fieldInputStyle}
              />
            </div>
            <PButton
              type="submit"
              tone="ghost"
              size="sm"
              disabled={revert.pending || !restoreMatches}
            >
              {revert.pending ? "Restoring…" : "Revert"}
            </PButton>
          </div>
          {revert.state?.ok ? (
            <span style={successTextStyle}>
              Restored {revert.state.value.totalRows} row
              {revert.state.value.totalRows === 1 ? "" : "s"} from the snapshot.
            </span>
          ) : null}
          <FormStatus state={revert.state} />
        </form>
      ) : null}
    </div>
  );
}
