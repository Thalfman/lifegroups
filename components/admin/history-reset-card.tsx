"use client";

// PRD-SAC6 follow-up: the Danger-Zone "Reset by category" card. Lists each
// history category with its current row count and a type-to-confirm Reset that
// clears just that category (capturing a recoverable snapshot first). Each
// category that has an un-restored snapshot also shows a Revert in a visually
// separated recovery panel. Mirrors the Clean Slate card's gating: the submit
// stays disabled until the exact phrase is typed, and the phrase is re-checked
// server-side in the action.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useValueChange } from "@/lib/hooks/use-value-change";
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
  fieldInputClassName,
  fieldLabelClassName,
  successTextClassName,
} from "@/components/admin/forms/field-styles";
import {
  DangerCard,
  DangerPill,
} from "@/components/admin/danger-zone-card-shell";
import { formatIsoDateTimeUtc } from "@/lib/shared/date";

export function HistoryResetCard({
  state,
}: {
  state: HistoryResetState | null;
}) {
  return (
    <DangerCard
      title="Reset by category — clear one kind of history"
      intro="Clear a single category of accumulated history at a time — useful before launch to remove invalid test data without wiping everything. Each reset captures a recoverable snapshot of just that category before deleting, and is audited. People, groups, shepherds, memberships, settings, and other categories are untouched. To clear every category at once, use Clean Slate instead."
    >
      {state === null ? (
        <p className="m-0 font-sans text-sm text-ink2">
          Impact preview unavailable — the per-category counts couldn&rsquo;t be
          loaded. Resets are disabled until they read successfully.
        </p>
      ) : (
        <div className="grid gap-2.5">
          {state.categories.map((category) => (
            <CategoryResetRow key={category.category} category={category} />
          ))}
        </div>
      )}
    </DangerCard>
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
  // Pull formRef out of the returned object: reading a ref member during render
  // (here, to bind the <form>) otherwise trips react-hooks/refs for every access
  // on the object. The rest keeps the `revert.state` / `.pending` call sites.
  const { formRef: revertFormRef, ...revert } =
    useActionForm<HistoryResetRevertSuccess>(
      superAdminResetHistoryCategoryRevert,
      { resetOnSuccess: true }
    );
  const [confirm, setConfirm] = useState("");
  const [restoreConfirm, setRestoreConfirm] = useState("");

  // Clear the controlled restore field after a successful revert so an
  // accidental resubmit doesn't immediately trip target_not_empty.
  const revertOk = revert.state?.ok;
  useValueChange(revertOk, (ok) => {
    if (ok) setRestoreConfirm("");
  });

  const meta = HISTORY_RESET_CATEGORY_META[category.category];
  const nothingToReset = category.count === 0;
  const phraseMatches = confirm.trim() === HISTORY_RESET_CONFIRM_PHRASE;
  const restoreMatches =
    restoreConfirm.trim() === CLEAN_SLATE_RESTORE_CONFIRM_PHRASE;
  const snapshot = category.snapshot;

  return (
    <div className="grid gap-2.5 rounded-sm border border-line bg-surface px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-sans text-sm font-semibold text-ink">
            {meta.label}
          </div>
          <p className="m-0 mt-0.5 font-sans text-xs leading-snug text-ink2">
            {meta.description}
          </p>
        </div>
        <div className="whitespace-nowrap font-sans text-xs text-ink2">
          {nothingToReset ? (
            "No rows"
          ) : (
            <>
              <strong className="text-ink">{category.count}</strong> row
              {category.count === 1 ? "" : "s"}
            </>
          )}
        </div>
      </div>

      <form action={reset.formAction} className="grid gap-2">
        <input type="hidden" name="category" value={category.category} />
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1 basis-44">
            <label
              htmlFor={`history-reset-confirm-${category.category}`}
              className={fieldLabelClassName}
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
              className={fieldInputClassName}
              disabled={nothingToReset}
            />
          </div>
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={reset.pending || !phraseMatches || nothingToReset}
          >
            {reset.pending ? "Clearing…" : "Reset"}
          </Button>
        </div>
        {reset.state?.ok ? (
          reset.state.value.nothingToClear ? (
            <span className="font-sans text-xs text-ink2">
              Already clear — there was nothing in this category to clear.
            </span>
          ) : (
            <span className={successTextClassName}>
              Cleared {reset.state.value.totalRows} row
              {reset.state.value.totalRows === 1 ? "" : "s"}. A snapshot was
              saved for recovery.
            </span>
          )
        ) : null}
        <FormStatus state={reset.state} />
      </form>

      {snapshot ? (
        // Recovery treatment: a sage-accented panel so the undo control reads
        // as the safety net, distinct from the reset above.
        <form
          ref={revertFormRef}
          action={revert.formAction}
          className="grid gap-2 rounded-sm border border-sage bg-sageSoft px-3 py-2.5"
        >
          <input type="hidden" name="snapshotId" value={snapshot.id} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-sans text-sm font-semibold text-sageDeep">
              Recovery
            </span>
            <DangerPill label="Reversible" tone="reversible" />
          </div>
          <div className="font-sans text-xs text-ink2">
            Recoverable snapshot: {snapshot.totalRows} row
            {snapshot.totalRows === 1 ? "" : "s"} captured{" "}
            {formatIsoDateTimeUtc(snapshot.createdAt)} UTC.
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1 basis-44">
              <label
                htmlFor={`history-restore-confirm-${category.category}`}
                className={fieldLabelClassName}
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
                className={fieldInputClassName}
              />
            </div>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={revert.pending || !restoreMatches}
            >
              {revert.pending ? "Restoring…" : "Revert"}
            </Button>
          </div>
          {revert.state?.ok ? (
            <span className={successTextClassName}>
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
