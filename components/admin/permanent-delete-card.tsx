"use client";

// ADR 0014 (#312–#316): the Super-Admin-only Permanent Deletion danger-zone
// card. Pick a curated entity type and a specific row, preflight what blocks the
// delete (cascade/restrict/no-action dependents named with counts, or the opaque
// confidential block), then confirm with the PERMANENTLY DELETE phrase. A
// recovery panel re-imports tombstoned rows (#315). Every mutation is re-gated
// and re-validated server-side in the RPC; the client gating is only UX.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AccountDeletionRequestQueue } from "@/components/admin/account-deletion-request-queue";
import type { AccountDeletionRequestQueueState } from "@/components/admin/super-admin/console-data";
import { useValueChange } from "@/lib/hooks/use-value-change";
import {
  superAdminPermanentDelete,
  superAdminLoadPermanentDeletionTargets,
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
  RecentTombstonesState,
} from "@/lib/supabase/permanent-deletion-reads";
import type { PermanentDeletionTargetPage } from "@/lib/admin/permanent-deletion";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  fieldLabelClassName,
  fieldInputClassName,
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
  accountDeletionRequestQueue,
}: {
  targets: PermanentDeletionTargetGroup[];
  tombstones: RecentTombstonesState;
  accountDeletionRequestQueue: AccountDeletionRequestQueueState;
}) {
  const preflight = useActionForm<DeletionPreflight>(
    superAdminPermanentDeletePreflight
  );
  const targetPage = useActionForm<PermanentDeletionTargetPage>(
    superAdminLoadPermanentDeletionTargets
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
  const [loadAttemptEntityType, setLoadAttemptEntityType] = useState("");

  const activeGroup = useMemo(
    () => targets.find((t) => t.entityType === entityType),
    [targets, entityType]
  );
  const isProfileDeletion = entityType === "profile";
  const loadedPage =
    targetPage.state?.ok && targetPage.state.value.entityType === entityType
      ? targetPage.state.value
      : null;
  const targetReadFailed = Boolean(
    activeGroup === undefined ||
    activeGroup.status === "failed" ||
    (loadAttemptEntityType === entityType && targetPage.state?.ok === false)
  );
  const activeItems = useMemo(() => {
    if (activeGroup?.status === "failed") return [];
    const items = loadedPage?.items ?? activeGroup?.items ?? [];
    if (
      entityType !== "profile" ||
      accountDeletionRequestQueue.status !== "loaded"
    ) {
      return items;
    }

    const itemsById = new Map(items.map((item) => [item.id, item]));
    for (const request of accountDeletionRequestQueue.requests) {
      if (!itemsById.has(request.profileId)) {
        itemsById.set(request.profileId, {
          id: request.profileId,
          label: `${request.requesterName} <${request.requesterEmail}>`,
        });
      }
    }
    return [...itemsById.values()];
  }, [activeGroup, accountDeletionRequestQueue, entityType, loadedPage]);

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
    !targetReadFailed &&
    !!selectedId &&
    phraseMatches &&
    report !== null &&
    report.deletable;

  return (
    <DangerCard
      title="Permanent deletion"
      intro={
        isProfileDeletion
          ? "Permanently erases a person's profile and identifying data. No restorable backup is retained, and the profile cannot be recovered. The act is audited; dependent or confidential records must be resolved first."
          : "Physically removes a curated record. This is the bounded exception to archive-everywhere: a backup copy is captured first so the record can be recovered, and the act is audited. Records that other records still depend on are refused until those are cleared; confidential records cannot be deleted (disable instead)."
      }
    >
      <AccountDeletionRequestQueue
        queue={accountDeletionRequestQueue}
        onReview={(request) => {
          setEntityType("profile");
          setSelectedId(request.profileId);
          setConfirm("");
        }}
      />
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
              disabled={targets.length === 0}
            >
              {targets.map((g) => (
                <option key={g.entityType} value={g.entityType}>
                  {g.pluralLabel}
                </option>
              ))}
            </select>
          </div>
          <form
            action={targetPage.formAction}
            className="grid gap-2"
            onSubmit={() => setLoadAttemptEntityType(entityType)}
          >
            <input type="hidden" name="entityType" value={entityType} />
            <div className="flex flex-wrap items-center gap-2">
              {loadedPage?.hasPrevious ? (
                <Button
                  type="submit"
                  name="page"
                  value={loadedPage.page - 1}
                  variant="ghost"
                  size="md"
                  disabled={targetPage.pending}
                >
                  Previous page
                </Button>
              ) : null}
              <Button
                type="submit"
                name="page"
                value={loadedPage?.page ?? 0}
                variant="ghost"
                size="md"
                disabled={targetPage.pending || !entityType}
              >
                {targetPage.pending
                  ? "Loading..."
                  : loadedPage
                    ? "Reload page"
                    : "Load records"}
              </Button>
              {loadedPage?.hasNext ? (
                <Button
                  type="submit"
                  name="page"
                  value={loadedPage.page + 1}
                  variant="ghost"
                  size="md"
                  disabled={targetPage.pending}
                >
                  Next page
                </Button>
              ) : null}
              {loadedPage ? (
                <span className="font-sans text-xs text-ink3">
                  Page {loadedPage.page + 1}; up to 50 records per page.
                </span>
              ) : null}
            </div>
            {loadAttemptEntityType === entityType ? (
              <FormStatus state={targetPage.state} />
            ) : null}
          </form>
          <div>
            <label htmlFor="perm-delete-row" className={fieldLabelClassName}>
              Record
            </label>
            <select
              id="perm-delete-row"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className={fieldSelectClassName}
              disabled={targetReadFailed || activeItems.length === 0}
            >
              <option value="">
                Select a {activeGroup?.label ?? "record"}…
              </option>
              {activeItems.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="perm-delete-id" className={fieldLabelClassName}>
              Record ID (direct lookup)
            </label>
            <input
              id="perm-delete-id"
              name="directRecordId"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value.trim())}
              className={fieldInputClassName}
              placeholder="Paste the exact record UUID"
              autoComplete="off"
            />
          </div>
          {targetReadFailed ? (
            <p className="m-0 font-sans text-sm text-ink2">
              {activeGroup?.pluralLabel ?? "Records"} could not be loaded.
              Refresh this page to try again.
            </p>
          ) : activeGroup?.status === "idle" && loadedPage === null ? (
            <p className="m-0 font-sans text-sm text-ink2">
              Load a page of records, or paste an exact record UUID.
            </p>
          ) : activeGroup?.status === "empty" ||
            loadedPage?.items.length === 0 ? (
            <p className="m-0 font-sans text-sm text-ink2">
              No {(activeGroup?.pluralLabel ?? "records").toLowerCase()} are
              available.
            </p>
          ) : null}
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
              disabled={preflight.pending || targetReadFailed || !selectedId}
            >
              {preflight.pending ? "Checking…" : "Check dependents"}
            </Button>
          </div>
          <FormStatus state={preflight.state} />
        </form>

        {report ? (
          <PreflightReport
            report={report}
            onTargetBlocker={(nextEntityType, id) => {
              setEntityType(nextEntityType);
              setSelectedId(id);
              setConfirm("");
            }}
          />
        ) : null}

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
                {del.state.value.entityType === "profile"
                  ? "Profile erased. Identifying data was permanently removed; there is no recovery copy."
                  : "Deleted. A backup copy was captured for recovery."}
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

function PreflightReport({
  report,
  onTargetBlocker,
}: {
  report: DeletionPreflight;
  onTargetBlocker: (entityType: string, id: string) => void;
}) {
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
  const profileErasure = report.entityType === "profile";
  const cleanupCount = report.cleanup.reduce((n, item) => n + item.count, 0);
  const setNullCount = report.setNull.reduce((n, item) => n + item.count, 0);
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
              className="grid gap-1 rounded-sm border border-line px-2 py-1.5"
            >
              <div className="flex justify-between gap-3">
                <span>
                  {b.table}.{b.column} ({b.action})
                </span>
                <strong className="text-ink">{b.count}</strong>
              </div>
              {b.ids.length > 0 ? (
                <div className="grid gap-1">
                  {b.ids.map((id) => (
                    <div
                      key={id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <code className="break-all text-ink">{id}</code>
                      {b.entityType ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onTargetBlocker(b.entityType!, id)}
                        >
                          Use as deletion target
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {b.count > b.ids.length ? (
                    <span>Showing the first {b.ids.length} blocker IDs.</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </>
      ) : (
        <div className="text-ink">
          {profileErasure
            ? "No blocking dependents. Ready for irreversible profile erasure."
            : "No blocking dependents. Safe to delete."}
        </div>
      )}
      {report.cleanup.length > 0 ? (
        <div className="mt-1">
          {profileErasure
            ? `Will permanently remove ${cleanupCount} assignment record${cleanupCount === 1 ? "" : "s"}. No recovery copy will be retained.`
            : `Will remove and back up ${cleanupCount} assignment record${cleanupCount === 1 ? "" : "s"} (kept in the backup copy; not re-created on restore).`}
        </div>
      ) : null}
      {report.setNull.length > 0 ? (
        <div className="mt-1">
          {profileErasure
            ? `Will permanently clear ${setNullCount} linked reference${setNullCount === 1 ? "" : "s"}. No recovery copy or re-link step will remain.`
            : `Will clear and back up ${setNullCount} linked reference${setNullCount === 1 ? "" : "s"} (re-linkable on restore).`}
        </div>
      ) : null}
    </div>
  );
}

function TombstoneRecovery({
  tombstones,
}: {
  tombstones: RecentTombstonesState;
}) {
  const records = tombstones.tombstones;
  const hasRestorableBackup =
    tombstones.status === "loaded" &&
    records.some((record) => record.restorable && record.restoredAt === null);
  const hasIrreversibleRecord =
    tombstones.status === "loaded" &&
    records.some((record) => !record.restorable && record.restoredAt === null);
  return (
    <DangerSection
      variant="recovery"
      label="Deleted-record recovery"
      status={
        hasRestorableBackup && hasIrreversibleRecord
          ? { label: "Mixed recovery", tone: "reversible" }
          : hasRestorableBackup
            ? { label: "Restores available", tone: "reversible" }
            : hasIrreversibleRecord
              ? { label: "Irreversible records", tone: "info" }
              : tombstones.status === "loaded"
                ? { label: "No pending restores", tone: "info" }
                : tombstones.status === "failed"
                  ? { label: "Unavailable", tone: "info" }
                  : { label: "No deletion records", tone: "info" }
      }
      description="Eligible non-profile records can be restored from their backup copies, including cleared references. Profile erasure records are status-only and can never be restored."
    >
      {tombstones.status === "failed" ? (
        <p className="m-0 font-sans text-sm text-ink2">
          Deleted-record history could not be loaded. Refresh this page to try
          again; no recovery state is assumed.
        </p>
      ) : tombstones.status === "empty" ? (
        <p className="m-0 font-sans text-sm text-ink2">
          No deleted-record history yet.
        </p>
      ) : (
        <div className="grid gap-2">
          {records.map((t) => (
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
  const irreversible = !tombstone.restorable;

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
      ) : irreversible ? (
        <span className="font-sans text-xs text-ink2">
          Irreversible:{" "}
          {tombstone.entityType === "profile"
            ? "this person's identifying data was permanently erased and cannot be restored."
            : "this deleted record cannot be restored."}
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
