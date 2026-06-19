"use client";

// Danger-Zone consolidation: the top-level "Reset everything to a clean launch
// state" card. One guarded step that composes the granular resets — it clears
// all accumulated history, hides the time-based launch warnings, AND resets the
// two duration-derived "Needs attention" Home cards (leader care + health
// checks) to a clean baseline. The granular cards below stay available for fine
// control, and each piece remains separately revertable from its own card. Gated
// behind a RESET EVERYTHING type-to-confirm phrase, re-checked server-side.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { superAdminResetAll } from "@/app/(protected)/admin/super-admin/reset-all-actions";
import {
  RESET_ALL_CONFIRM_PHRASE,
  type ResetAllSuccess,
} from "@/lib/admin/danger-zone";
import {
  LAUNCH_MUTE_FLAG_KEYS,
  resolveFlag,
  type FeatureFlagsConfig,
} from "@/lib/admin/feature-flags";
import type {
  AttentionResetState,
  CleanSlateImpact,
} from "@/lib/supabase/maintenance-reads";
import { ATTENTION_RESET_SURFACE_META } from "@/lib/admin/attention-reset";
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 font-sans text-xs text-ink2">
      <span>{label}</span>
      <strong className="text-ink">{value}</strong>
    </div>
  );
}

export function ResetAllCard({
  impact,
  featureFlags,
  attentionState,
}: {
  impact: CleanSlateImpact | null;
  featureFlags: FeatureFlagsConfig;
  attentionState: AttentionResetState | null;
}) {
  const { state, formAction, pending } =
    useActionForm<ResetAllSuccess>(superAdminResetAll);
  const [confirm, setConfirm] = useState("");

  const phraseMatches = confirm.trim() === RESET_ALL_CONFIRM_PHRASE;
  const historyRows = impact?.total ?? 0;
  // The wipe step needs the impact read to have succeeded; gate the whole action
  // on a clean read so the preview can't mislead (mirrors the Launch Prep card).
  const impactUnavailable = impact === null;
  const remainingToMute = LAUNCH_MUTE_FLAG_KEYS.filter(
    (key) => !resolveFlag(featureFlags, key)
  ).length;

  return (
    <DangerCard
      emphasis
      title="Reset everything — one clean launch state"
      intro="The single step most operators want before launch. It does everything the granular workflows do in one guarded action: clears all accumulated history, hides the time-based “Needs attention” launch warnings, and resets the leader-care and health-check attention cards to a clean baseline. People, groups, leaders, memberships, settings, care profiles & notes, and the audit log are kept. Recoverable snapshots are captured first — undo each piece from its own workflow. Running it again when everything is already clean is a safe no-op."
    >
      <DangerSection
        variant="destructive"
        label="Reset to a clean launch state"
        status={
          impactUnavailable
            ? { label: "Locked", tone: "locked" }
            : { label: "Requires confirmation", tone: "confirm" }
        }
      >
        {/* Impact preview. */}
        {impactUnavailable ? (
          <p className="m-0 font-sans text-sm text-ink2">
            Impact preview unavailable — the history counts couldn&rsquo;t be
            loaded. Reset everything is disabled until they read successfully.
          </p>
        ) : (
          <div className="grid gap-1.5 rounded-sm border border-line bg-surfaceAlt px-3 py-2.5">
            <SummaryRow
              label="Clear accumulated history"
              value={`${historyRows} row${historyRows === 1 ? "" : "s"}`}
            />
            <SummaryRow
              label="Hide launch warnings on Home"
              value={
                remainingToMute === 0
                  ? "already hidden"
                  : `${remainingToMute} to hide`
              }
            />
            {(attentionState?.surfaces ?? []).map((surface) => (
              <SummaryRow
                key={surface.surface}
                label={`Reset ${ATTENTION_RESET_SURFACE_META[surface.surface].label}`}
                value={`${surface.impactCount} ${
                  surface.surface === "care"
                    ? `shepherd care profile${surface.impactCount === 1 ? "" : "s"}`
                    : `active group${surface.impactCount === 1 ? "" : "s"}`
                }`}
              />
            ))}
          </div>
        )}

        <form action={formAction} className="grid gap-2.5">
          <div>
            <label htmlFor="reset-all-confirm" className={fieldLabelClassName}>
              Type {RESET_ALL_CONFIRM_PHRASE} to confirm
            </label>
            <input
              id="reset-all-confirm"
              name="confirm"
              type="text"
              autoComplete="off"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={RESET_ALL_CONFIRM_PHRASE}
              className={fieldInputClassName}
            />
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              type="submit"
              variant="destructive"
              size="md"
              disabled={pending || !phraseMatches || impactUnavailable}
            >
              {pending ? "Resetting…" : "Reset everything"}
            </Button>
            {state?.ok ? (
              <span className={successTextClassName}>
                {state.value.clearedRows > 0
                  ? `Cleared ${state.value.clearedRows} row${
                      state.value.clearedRows === 1 ? "" : "s"
                    } of history`
                  : "History was already clear"}
                {" · "}launch warnings hidden · attention cards reset.
                {state.value.snapshotId
                  ? " A snapshot was saved for recovery."
                  : ""}
              </span>
            ) : null}
          </div>
          <FormStatus state={state} />
        </form>
      </DangerSection>
    </DangerCard>
  );
}
