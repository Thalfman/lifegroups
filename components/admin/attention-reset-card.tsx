"use client";

// health-checks-reset: the Danger-Zone "Reset attention" card. For each
// duration-derived Home card (leader care, health checks) it offers a
// type-to-confirm reset that sets an "as-of" baseline so the card drops to zero
// WITHOUT muting/hiding and WITHOUT deleting history — a true fresh start that
// re-surfaces naturally as real time passes. Each reset captures a recoverable
// snapshot first and is audited; the undo controls live in visually separated
// recovery panels, mirroring the Reset-by-category card.

import { useEffect, useState } from "react";
import { PButton } from "@/components/pastoral/button";
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
import {
  fieldInputClass,
  fieldInputStyle,
  fieldLabelStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import {
  DangerCard,
  DangerPill,
} from "@/components/admin/danger-zone-card-shell";
import { P, fontBody, fontSans } from "@/lib/pastoral";

// Fixed locale + UTC so server and client render the same string (no hydration
// mismatch). Mirrors the Reset-by-category card's snapshot formatter.
function formatSnapshotTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

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
const recoveryPanelStyle = {
  display: "grid",
  gap: 8,
  background: P.sageSoft,
  border: `1px solid ${P.sage}`,
  borderRadius: 8,
  padding: "10px 12px",
} as const;

const recoveryLabelStyle = {
  fontFamily: fontSans,
  fontSize: 11,
  letterSpacing: 1,
  textTransform: "uppercase" as const,
  color: P.sageTextStrong,
  fontWeight: 700,
};

// Impact unit per surface — what a global reset touches.
function impactLabel(surface: AttentionResetSurface, count: number): string {
  if (surface === "care") {
    return `${count} leader care profile${count === 1 ? "" : "s"}`;
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
      title="Reset attention — fresh start for the time-based Home cards"
      intro={
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.terraTextStrong,
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          The “overdue or missing health checks” and “leaders needing care”
          cards are driven by elapsed time, so deleting history never clears
          them and muting only hides them. A reset records a recoverable “as-of”
          baseline so the card drops to zero <em>without</em> hiding it — then
          re-surfaces naturally once real time passes. Unlike the mute flags,
          this is a genuine fresh start, not a permanent hide.
        </p>
      }
    >
      {state === null ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink2,
            margin: 0,
          }}
        >
          Impact preview unavailable — the reset state couldn&rsquo;t be loaded.
          Resets are disabled until it reads successfully.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
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
  const revert = useActionForm<AttentionResetRevertSuccess>(
    superAdminResetAttentionRevert,
    { resetOnSuccess: true }
  );
  // A single useActionForm shared by every per-entity revert row below, gated by
  // one RESTORE input for the surface (typing it once enables all rows).
  const entityRevert = useActionForm<AttentionResetRevertSuccess>(
    superAdminResetAttentionRevert,
    { resetOnSuccess: true }
  );
  const [confirm, setConfirm] = useState("");
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [entityRestoreConfirm, setEntityRestoreConfirm] = useState("");

  const revertOk = revert.state?.ok;
  useEffect(() => {
    if (revertOk) setRestoreConfirm("");
  }, [revertOk]);
  const entityRevertOk = entityRevert.state?.ok;
  useEffect(() => {
    if (entityRevertOk) setEntityRestoreConfirm("");
  }, [entityRevertOk]);

  const meta = ATTENTION_RESET_SURFACE_META[surface.surface];
  const phrase = CONFIRM_PHRASE[surface.surface];
  const phraseMatches = confirm.trim() === phrase;
  const restoreMatches =
    restoreConfirm.trim() === CLEAN_SLATE_RESTORE_CONFIRM_PHRASE;
  const entityRestoreMatches =
    entityRestoreConfirm.trim() === CLEAN_SLATE_RESTORE_CONFIRM_PHRASE;
  const snapshot = surface.snapshot;
  const entitySnapshots = surface.entitySnapshots;

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
            textAlign: "right",
          }}
        >
          {impactLabel(surface.surface, surface.impactCount)}
          {surface.globalBaselineOn ? (
            <div style={{ color: P.terraTextStrong, marginTop: 2 }}>
              Reset {surface.globalBaselineOn}
            </div>
          ) : null}
          {surface.entityOverrideCount > 0 ? (
            <div style={{ marginTop: 2 }}>
              {surface.entityOverrideCount} single reset
              {surface.entityOverrideCount === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
      </div>

      <form action={reset.formAction} style={{ display: "grid", gap: 8 }}>
        <input type="hidden" name="scope" value="global" />
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
              htmlFor={`attention-reset-confirm-${surface.surface}`}
              style={fieldLabelStyle}
            >
              Type {phrase} to confirm
            </label>
            <input
              id={`attention-reset-confirm-${surface.surface}`}
              name="confirm"
              type="text"
              autoComplete="off"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={phrase}
              className={fieldInputClass}
              style={fieldInputStyle}
            />
          </div>
          <PButton
            type="submit"
            tone="terra"
            size="sm"
            disabled={reset.pending || !phraseMatches}
          >
            {reset.pending ? "Resetting…" : "Reset all"}
          </PButton>
        </div>
        {reset.state?.ok ? (
          <span style={successTextStyle}>
            Reset done — the card will read clear.{" "}
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
          ref={revert.formRef}
          action={revert.formAction}
          style={recoveryPanelStyle}
        >
          <input type="hidden" name="snapshotId" value={snapshot.id} />
          <input type="hidden" name="surface" value={surface.surface} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={recoveryLabelStyle}>Recovery</span>
            <DangerPill label="Reversible" tone="reversible" />
          </div>
          <div style={{ fontFamily: fontSans, fontSize: 12, color: P.ink2 }}>
            Recoverable reset captured {formatSnapshotTime(snapshot.createdAt)}{" "}
            UTC.
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
                htmlFor={`attention-restore-confirm-${surface.surface}`}
                style={fieldLabelStyle}
              >
                Type {CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} to restore
              </label>
              <input
                id={`attention-restore-confirm-${surface.surface}`}
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
              Reset reverted — the card returns to its pre-reset state.
            </span>
          ) : null}
          <FormStatus state={revert.state} />
        </form>
      ) : null}

      {entitySnapshots.length > 0 ? (
        <div style={recoveryPanelStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={recoveryLabelStyle}>
              Undo single resets ({entitySnapshots.length})
            </span>
            <DangerPill label="Reversible" tone="reversible" />
          </div>
          <div style={{ fontFamily: fontSans, fontSize: 12, color: P.ink2 }}>
            Type {CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} once to enable.
          </div>
          <input
            aria-label={`Type ${CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} to enable single-reset undo for ${meta.label}`}
            name="entity-restore-confirm"
            type="text"
            autoComplete="off"
            value={entityRestoreConfirm}
            onChange={(e) => setEntityRestoreConfirm(e.target.value)}
            placeholder={CLEAN_SLATE_RESTORE_CONFIRM_PHRASE}
            className={fieldInputClass}
            style={{ ...fieldInputStyle, maxWidth: 220 }}
          />
          {entitySnapshots.map((es) => (
            <form
              key={es.id}
              action={entityRevert.formAction}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <input type="hidden" name="snapshotId" value={es.id} />
              <input type="hidden" name="surface" value={surface.surface} />
              <input
                type="hidden"
                name="confirm"
                value={entityRestoreConfirm}
              />
              <span
                style={{ fontFamily: fontSans, fontSize: 12, color: P.ink2 }}
              >
                {es.entityId.slice(0, 8)}… · {formatSnapshotTime(es.createdAt)}{" "}
                UTC
              </span>
              <PButton
                type="submit"
                tone="ghost"
                size="sm"
                disabled={entityRevert.pending || !entityRestoreMatches}
              >
                {entityRevert.pending ? "Restoring…" : "Revert"}
              </PButton>
            </form>
          ))}
          {entityRevert.state?.ok ? (
            <span style={successTextStyle}>Single reset reverted.</span>
          ) : null}
          <FormStatus state={entityRevert.state} />
        </div>
      ) : null}
    </div>
  );
}
