"use client";

// health-checks-reset: the Danger-Zone "Reset attention" card. For each
// duration-derived Home card (leader care, health checks) it offers a
// type-to-confirm reset that sets an "as-of" baseline so the card drops to zero
// WITHOUT muting/hiding and WITHOUT deleting history — a true fresh start that
// re-surfaces naturally as real time passes. Each reset captures a recoverable
// snapshot first and is audited; the undo controls live in visually separated
// recovery panels, mirroring the Reset-by-category card.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useValueChange } from "@/lib/hooks/use-value-change";
import {
  superAdminResetCareAttention,
  superAdminResetHealthAttention,
  superAdminResetAttentionRevert,
} from "@/app/(protected)/admin/super-admin/attention-reset-actions";
import {
  RESET_CARE_ATTENTION_CONFIRM_PHRASE,
  RESET_HEALTH_ATTENTION_CONFIRM_PHRASE,
  CLEAN_SLATE_RESTORE_CONFIRM_PHRASE,
  type AttentionResetSuccess,
  type AttentionResetRevertSuccess,
} from "@/lib/admin/danger-zone";
import {
  ATTENTION_RESET_SURFACE_META,
  type AttentionResetSurface,
} from "@/lib/admin/attention-reset";
import type {
  AttentionResetState,
  AttentionResetSurfaceState,
} from "@/lib/supabase/maintenance-reads";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { successTextClassName } from "@/components/admin/forms/field-styles";
import {
  ConfirmPhraseInput,
  confirmPhraseMatches,
} from "@/components/admin/forms/confirm-phrase-input";
import {
  DangerCard,
  DangerPill,
} from "@/components/admin/danger-zone-card-shell";
import { formatIsoDateTimeUtc } from "@/lib/shared/date";

const CONFIRM_PHRASE: Record<AttentionResetSurface, string> = {
  care: RESET_CARE_ATTENTION_CONFIRM_PHRASE,
  health: RESET_HEALTH_ATTENTION_CONFIRM_PHRASE,
};

const RESET_ACTION = {
  care: superAdminResetCareAttention,
  health: superAdminResetHealthAttention,
} as const;

// A sage-accented recovery panel so the undo controls read as the safety net,
// distinct from the reset above. Shared by the global revert and the per-entity
// undo list.
const RECOVERY_PANEL_CLASS =
  "grid gap-2 rounded-sm border border-sage bg-sageSoft px-3 py-2.5";

const RECOVERY_LABEL_CLASS = "font-sans text-sm font-semibold text-sageDeep";

// Impact unit per surface — what a global reset touches.
function impactLabel(surface: AttentionResetSurface, count: number): string {
  if (surface === "care") {
    return `${count} shepherd care profile${count === 1 ? "" : "s"}`;
  }
  return `${count} active group${count === 1 ? "" : "s"}`;
}

export function AttentionResetCard({
  state,
}: {
  state: AttentionResetState | null;
}) {
  return (
    <DangerCard
      title="Reset attention: fresh start for the time-based Home cards"
      intro={
        <p className="m-0 font-sans text-sm text-ink2">
          The “overdue or missing health checks” and “leaders needing care”
          cards are driven by elapsed time, so deleting history never clears
          them and muting only hides them. A reset records a recoverable “as-of”
          baseline so the card drops to zero <em>without</em> hiding it. It then
          re-surfaces naturally once real time passes. Unlike the mute flags,
          this is a genuine fresh start, not a permanent hide.
        </p>
      }
    >
      {state === null ? (
        <p className="m-0 font-sans text-sm text-ink2">
          Impact preview unavailable. The reset state couldn&rsquo;t be loaded.
          Resets are disabled until it reads successfully.
        </p>
      ) : (
        <div className="grid gap-2.5">
          {state.surfaces.map((surface) => (
            <SurfaceResetRow key={surface.surface} surface={surface} />
          ))}
        </div>
      )}
    </DangerCard>
  );
}

function SurfaceResetRow({ surface }: { surface: AttentionResetSurfaceState }) {
  const reset = useActionForm<AttentionResetSuccess>(
    RESET_ACTION[surface.surface]
  );
  // Pull formRef out of the returned object: reading a ref member during render
  // (here, to bind the <form>) otherwise trips react-hooks/refs for every access
  // on the object. The rest keeps the `revert.state` / `.pending` call sites.
  const { formRef: revertFormRef, ...revert } =
    useActionForm<AttentionResetRevertSuccess>(superAdminResetAttentionRevert, {
      resetOnSuccess: true,
    });
  // A single useActionForm shared by every per-entity revert row below, gated by
  // one RESTORE input for the surface (typing it once enables all rows).
  const entityRevert = useActionForm<AttentionResetRevertSuccess>(
    superAdminResetAttentionRevert,
    { resetOnSuccess: true }
  );
  const [confirm, setConfirm] = useState("");
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [entityRestoreConfirm, setEntityRestoreConfirm] = useState("");

  // Clear the controlled restore fields after a successful revert (derived
  // during render rather than in an effect to avoid the cascading-render smell).
  const revertOk = revert.state?.ok;
  useValueChange(revertOk, (ok) => {
    if (ok) setRestoreConfirm("");
  });
  const entityRevertOk = entityRevert.state?.ok;
  useValueChange(entityRevertOk, (ok) => {
    if (ok) setEntityRestoreConfirm("");
  });

  const meta = ATTENTION_RESET_SURFACE_META[surface.surface];
  const phrase = CONFIRM_PHRASE[surface.surface];
  const phraseMatches = confirmPhraseMatches(confirm, phrase);
  const restoreMatches = confirmPhraseMatches(
    restoreConfirm,
    CLEAN_SLATE_RESTORE_CONFIRM_PHRASE
  );
  const entityRestoreMatches = confirmPhraseMatches(
    entityRestoreConfirm,
    CLEAN_SLATE_RESTORE_CONFIRM_PHRASE
  );
  const snapshot = surface.snapshot;
  const entitySnapshots = surface.entitySnapshots;

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
        <div className="whitespace-nowrap text-right font-sans text-xs text-ink2">
          {impactLabel(surface.surface, surface.impactCount)}
          {surface.globalBaselineOn ? (
            <div className="mt-0.5 text-clayDeep">
              Reset {surface.globalBaselineOn}
            </div>
          ) : null}
          {surface.entityOverrideCount > 0 ? (
            <div className="mt-0.5">
              {surface.entityOverrideCount} single reset
              {surface.entityOverrideCount === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
      </div>

      <form action={reset.formAction} className="grid gap-2">
        <input type="hidden" name="scope" value="global" />
        <div className="flex flex-wrap items-end gap-2">
          <ConfirmPhraseInput
            id={`attention-reset-confirm-${surface.surface}`}
            phrase={phrase}
            label={<>Type {phrase} to confirm</>}
            className="min-w-40 flex-1 basis-44"
            value={confirm}
            onChange={setConfirm}
          />
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={reset.pending || !phraseMatches}
          >
            {reset.pending ? "Resetting…" : "Reset all"}
          </Button>
        </div>
        {reset.state?.ok ? (
          <span className={successTextClassName}>
            Reset done. The card will read clear.{" "}
            {surface.surface === "care"
              ? `${reset.state.value.affected} care profile${
                  reset.state.value.affected === 1 ? "" : "s"
                } cleared.`
              : `${reset.state.value.affected} follow-up flag${
                  reset.state.value.affected === 1 ? "" : "s"
                } cleared.`}{" "}
            A snapshot was saved for recovery.
          </span>
        ) : null}
        <FormStatus state={reset.state} />
      </form>

      {snapshot ? (
        <form
          ref={revertFormRef}
          action={revert.formAction}
          className={RECOVERY_PANEL_CLASS}
        >
          <input type="hidden" name="snapshotId" value={snapshot.id} />
          <input type="hidden" name="surface" value={surface.surface} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={RECOVERY_LABEL_CLASS}>Recovery</span>
            <DangerPill label="Reversible" tone="reversible" />
          </div>
          <div className="font-sans text-xs text-ink2">
            Recoverable reset captured{" "}
            {formatIsoDateTimeUtc(snapshot.createdAt)} UTC.
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <ConfirmPhraseInput
              id={`attention-restore-confirm-${surface.surface}`}
              phrase={CLEAN_SLATE_RESTORE_CONFIRM_PHRASE}
              label={<>Type {CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} to restore</>}
              className="min-w-40 flex-1 basis-44"
              value={restoreConfirm}
              onChange={setRestoreConfirm}
            />
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
              Reset reverted. The card returns to its pre-reset state.
            </span>
          ) : null}
          <FormStatus state={revert.state} />
        </form>
      ) : null}

      {entitySnapshots.length > 0 ? (
        <div className={RECOVERY_PANEL_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={RECOVERY_LABEL_CLASS}>
              Undo single resets ({entitySnapshots.length})
            </span>
            <DangerPill label="Reversible" tone="reversible" />
          </div>
          <div className="font-sans text-xs text-ink2">
            Type {CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} once to enable.
          </div>
          <ConfirmPhraseInput
            phrase={CLEAN_SLATE_RESTORE_CONFIRM_PHRASE}
            ariaLabel={`Type ${CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} to enable single-reset undo for ${meta.label}`}
            name="entity-restore-confirm"
            bounded
            value={entityRestoreConfirm}
            onChange={setEntityRestoreConfirm}
          />
          {entitySnapshots.map((es) => (
            <form
              key={es.id}
              action={entityRevert.formAction}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <input type="hidden" name="snapshotId" value={es.id} />
              <input type="hidden" name="surface" value={surface.surface} />
              <input
                type="hidden"
                name="confirm"
                value={entityRestoreConfirm}
              />
              <span className="font-sans text-xs text-ink2">
                {es.entityId.slice(0, 8)}… ·{" "}
                {formatIsoDateTimeUtc(es.createdAt)} UTC
              </span>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                disabled={entityRevert.pending || !entityRestoreMatches}
              >
                {entityRevert.pending ? "Restoring…" : "Revert"}
              </Button>
            </form>
          ))}
          {entityRevert.state?.ok ? (
            <span className={successTextClassName}>Single reset reverted.</span>
          ) : null}
          <FormStatus state={entityRevert.state} />
        </div>
      ) : null}
    </div>
  );
}
