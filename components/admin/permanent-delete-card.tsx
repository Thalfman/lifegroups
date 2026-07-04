"use client";

// ADR 0014 (#312–#316): the Super-Admin-only Permanent Deletion danger-zone
// card. Pick a curated entity type and a specific row, preflight what blocks the
// delete (cascade/restrict/no-action dependents named with counts, or the opaque
// confidential block), then confirm with the PERMANENTLY DELETE phrase. A
// recovery panel re-imports tombstoned rows (#315). Every mutation is re-gated
// and re-validated server-side in the RPC; the client gating is only UX.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useValueChange } from "@/lib/hooks/use-value-change";
import {
  superAdminPermanentDelete,
  superAdminPermanentDeletePreflight,
  superAdminRestoreTombstone,
} from "@/app/(protected)/admin/super-admin/permanent-delete-actions";
import {
  PERMANENT_DELETE_CONFIRM_PHRASE,
  TOMBSTONE_RESTORE_CONFIRM_PHRASE,
  type DeletionPreflight,
  type PermanentDeleteSuccess,
  type TombstoneRestoreSuccess,
} from "@/lib/admin/danger-zone";
import type {
  PermanentDeletionTargetGroup,
  RecentTombstone,
} from "@/lib/supabase/permanent-deletion-reads";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  fieldLabelClassName,
  fieldSelectClassName,
  successTextClassName,
} from "@/components/admin/forms/field-styles";
import {
  ConfirmPhraseInput,
  confirmPhraseMatches,
} from "@/components/admin/forms/confirm-phrase-input";
import {
  DangerCard,
  DangerSection,
} from "@/components/admin/danger-zone-card-shell";
import { formatIsoDateTimeUtc } from "@/lib/shared/date";

export function PermanentDeleteCard({
  targets,
  tombstones,
}: {
  targets: PermanentDeletionTargetGroup[];
  tombstones: RecentTombstone[];
}) {
  const preflight = useActionForm<DeletionPreflight>(
    superAdminPermanentDeletePreflight
  );
  // Pull formRef out of the returned object: reading a ref member during render
  // (here, to bind the <form>) otherwise trips react-hooks/refs for every access
  // on the object. The rest keeps the `del.state` / `.pending` call sites.
  const { formRef: delFormRef, ...del } = useActionForm<PermanentDeleteSuccess>(
    superAdminPermanentDelete,
    { resetOnSuccess: true }
  );

  const [entityType, setEntityType] = useState(targets[0]?.entityType ?? "");
  const [selectedId, setSelectedId] = useState("");
  const [confirm, setConfirm] = useState("");

  const activeGroup = useMemo(
    () => targets.find((t) => t.entityType === entityType),
    [targets, entityType]
  );

  // A new target selection invalidates the prior confirm phrase. Derived during
  // render rather than in an effect to avoid the cascading-render smell.
  useValueChange(`${entityType}\u0000${selectedId}`, () => {
    setConfirm("");
  });

  // After a successful delete the targeted row is gone — clear the selection
  // and confirm so the form can't be re-submitted against the now-missing row.
  // Track the state object (not the extracted boolean, which stays true across
  // consecutive successes and would skip the reset on a second delete).
  const delState = del.state;
  useValueChange(delState, (next) => {
    if (next?.ok) {
      setSelectedId("");
      setConfirm("");
    }
  });

  // The preflight result only describes the row it was run for. Stamped with its
  // target, so a report for a previously-selected row is discarded the moment
  // the operator picks a different one — it must never gate a delete of another
  // row or show that row's blockers under the wrong selection.
  const report =
    preflight.state?.ok &&
    preflight.state.value.entityType === entityType &&
    preflight.state.value.entityId === selectedId
      ? preflight.state.value
      : null;
  const phraseMatches = confirmPhraseMatches(
    confirm,
    PERMANENT_DELETE_CONFIRM_PHRASE
  );
  const canDelete =
    !!selectedId && phraseMatches && report !== null && report.deletable;

  return (
    <DangerCard
      title="Permanent deletion"
      intro="Physically removes a curated record. This is the bounded exception to archive-everywhere: a backup copy is captured first so it can be recovered, and the act is audited. Records that other records still depend on are refused until those are cleared; confidential records cannot be deleted (disable instead)."
    >
      <DangerSection
        variant="destructive"
        label="Delete a record"
        status={{ label: "Requires confirmation", tone: "confirm" }}
      >
        {/* Target pickers. */}
        <div className="grid gap-2.5">
          <div>
            <label htmlFor="perm-delete-type" className={fieldLabelClassName}>
              Record type
            </label>
            <select
              id="perm-delete-type"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setSelectedId("");
              }}
              className={fieldSelectClassName}
            >
              {targets.map((g) => (
                <option key={g.entityType} value={g.entityType}>
                  {g.pluralLabel}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="perm-delete-row" className={fieldLabelClassName}>
              Record
            </label>
            <select
              id="perm-delete-row"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className={fieldSelectClassName}
            >
              <option value="">
                Select a {activeGroup?.label ?? "record"}…
              </option>
              {(activeGroup?.items ?? []).map((it) => (
                <option key={it.id} value={it.id}>
                  {it.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Preflight. */}
        <form action={preflight.formAction} className="grid gap-2">
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="id" value={selectedId} />
          <div>
            <Button
              type="submit"
              variant="ghost"
              size="md"
              disabled={preflight.pending || !selectedId}
            >
              {preflight.pending ? "Checking…" : "Check dependents"}
            </Button>
          </div>
          <FormStatus state={preflight.state} />
        </form>

        {report ? <PreflightReport report={report} /> : null}

        {/* Confirm + delete. */}
        <form ref={delFormRef} action={del.formAction} className="grid gap-2.5">
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="id" value={selectedId} />
          <ConfirmPhraseInput
            id="perm-delete-confirm"
            phrase={PERMANENT_DELETE_CONFIRM_PHRASE}
            label={<>Type {PERMANENT_DELETE_CONFIRM_PHRASE} to confirm</>}
            value={confirm}
            onChange={setConfirm}
          />
          <div className="flex items-center gap-2.5">
            <Button
              type="submit"
              variant="destructive"
              size="md"
              disabled={del.pending || !canDelete}
            >
              {del.pending ? "Deleting…" : "Permanently delete"}
            </Button>
            {del.state?.ok ? (
              <span className={successTextClassName}>
                Deleted. A backup copy was captured for recovery.
              </span>
            ) : null}
          </div>
          {report !== null && !report.deletable ? (
            <p className="m-0 font-sans text-xs text-ink2">
              This record can&rsquo;t be deleted yet. See the blockers above.
            </p>
          ) : null}
          <FormStatus state={del.state} />
        </form>
      </DangerSection>

      <TombstoneRecovery tombstones={tombstones} />
    </DangerCard>
  );
}

function PreflightReport({ report }: { report: DeletionPreflight }) {
  if (report.confidential) {
    return (
      <div className="rounded-sm border border-line bg-surfaceAlt px-3 py-2.5 font-sans text-sm text-ink2">
        This person has confidential records and cannot be permanently deleted;
        disable instead.
      </div>
    );
  }
  if (report.forbidden) {
    return (
      <div className="rounded-sm border border-line bg-surfaceAlt px-3 py-2.5 font-sans text-sm text-ink2">
        That record can&rsquo;t be targeted for permanent deletion.
      </div>
    );
  }
  return (
    <div className="grid gap-1.5 rounded-sm border border-line bg-surfaceAlt px-3 py-2.5 font-sans text-xs text-ink2">
      {report.blockers.length > 0 ? (
        <>
          <div className="font-bold text-ink">
            Blocked by {report.blockers.length} dependent
            {report.blockers.length === 1 ? "" : "s"}. Clear these first:
          </div>
          {report.blockers.map((b) => (
            <div
              key={`${b.table}.${b.column}`}
              className="flex justify-between gap-3"
            >
              <span>
                {b.table}.{b.column} ({b.action})
              </span>
              <strong className="text-ink">{b.count}</strong>
            </div>
          ))}
        </>
      ) : (
        <div className="text-ink">No blocking dependents. Safe to delete.</div>
      )}
      {report.setNull.length > 0 ? (
        <div className="mt-1">
          Will clear and back up{" "}
          {report.setNull.reduce((n, s) => n + s.count, 0)} linked reference
          {report.setNull.reduce((n, s) => n + s.count, 0) === 1
            ? ""
            : "s"}{" "}
          (re-linkable on restore).
        </div>
      ) : null}
    </div>
  );
}

function TombstoneRecovery({ tombstones }: { tombstones: RecentTombstone[] }) {
  return (
    <DangerSection
      variant="recovery"
      label="Recover a deleted record"
      status={
        tombstones.length > 0
          ? { label: "Reversible", tone: "reversible" }
          : { label: "No backups", tone: "info" }
      }
      description="Restore a deleted record from its backup copy, re-linking the references the delete cleared. The backup is kept after restoring."
    >
      {tombstones.length === 0 ? (
        <p className="m-0 font-sans text-sm text-ink2">
          No backups yet. Nothing has been permanently deleted.
        </p>
      ) : (
        <div className="grid gap-2">
          {tombstones.map((t) => (
            <TombstoneRow key={t.id} tombstone={t} />
          ))}
        </div>
      )}
    </DangerSection>
  );
}

function TombstoneRow({ tombstone }: { tombstone: RecentTombstone }) {
  // Pull formRef out of the returned object: reading a ref member during render
  // (here, to bind the <form>) otherwise trips react-hooks/refs for every access
  // on the object. The rest keeps the `restore.state` / `.pending` call sites.
  const { formRef: restoreFormRef, ...restore } =
    useActionForm<TombstoneRestoreSuccess>(superAdminRestoreTombstone, {
      resetOnSuccess: true,
    });
  const [confirm, setConfirm] = useState("");
  // Track the state object, not the extracted boolean (which stays true across
  // consecutive successes and would skip clearing on a later restore). Derived
  // during render rather than in an effect to avoid the cascading-render smell.
  const restoreState = restore.state;
  useValueChange(restoreState, (next) => {
    if (next?.ok) setConfirm("");
  });
  const matches = confirmPhraseMatches(
    confirm,
    TOMBSTONE_RESTORE_CONFIRM_PHRASE
  );
  const alreadyRestored = tombstone.restoredAt !== null;

  return (
    <form
      ref={restoreFormRef}
      action={restore.formAction}
      className="grid gap-2 rounded-sm border border-line bg-surface px-3 py-2.5"
    >
      <input type="hidden" name="tombstoneId" value={tombstone.id} />
      <div className="flex justify-between gap-3 font-sans text-xs text-ink2">
        <span>
          <strong className="text-ink">{tombstone.label}</strong>{" "}
          <span className="text-ink3">({tombstone.entityType})</span>
        </span>
        <span>{formatIsoDateTimeUtc(tombstone.deletedAt)} UTC</span>
      </div>
      {alreadyRestored ? (
        <span className="font-sans text-xs text-ink3">
          Already restored{" "}
          {formatIsoDateTimeUtc(tombstone.restoredAt as string)} UTC.
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmPhraseInput
            phrase={TOMBSTONE_RESTORE_CONFIRM_PHRASE}
            ariaLabel={`Type ${TOMBSTONE_RESTORE_CONFIRM_PHRASE} to confirm restoring ${tombstone.label}`}
            bounded
            value={confirm}
            onChange={setConfirm}
          />
          <Button
            type="submit"
            variant="ghost"
            size="md"
            disabled={restore.pending || !matches}
          >
            {restore.pending ? "Restoring…" : "Restore"}
          </Button>
          {restore.state?.ok ? (
            <span className={successTextClassName}>
              Restored ({restore.state.value.relinked} re-linked,{" "}
              {restore.state.value.skipped} skipped).
            </span>
          ) : null}
        </div>
      )}
      <FormStatus state={restore.state} />
    </form>
  );
}
