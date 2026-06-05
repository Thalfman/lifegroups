"use client";

// Danger-Zone consolidation: the top-level "Reset everything to a clean launch
// state" card. One guarded step that composes the granular resets — it clears
// all accumulated history, hides the time-based launch warnings, AND resets the
// two duration-derived "Needs attention" Home cards (leader care + health
// checks) to a clean baseline. The granular cards below stay available for fine
// control, and each piece remains separately revertable from its own card. Gated
// behind a RESET EVERYTHING type-to-confirm phrase, re-checked server-side.

import { useState } from "react";
import { PButton } from "@/components/pastoral/button";
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
  fieldInputClass,
  fieldInputStyle,
  fieldLabelStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";

// The Home "Needs attention" warning each launch-optics mute flag silences,
// phrased as the operator sees it on Home (mirrors the Launch Prep card).
const LAUNCH_WARNING_LABELS: Record<string, string> = {
  mute_care_attention: "Leaders needing care attention",
  mute_health_checks: "Overdue or missing health checks",
  mute_follow_ups: "Open follow-ups",
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontFamily: fontSans,
        fontSize: 12,
        color: P.ink2,
      }}
    >
      <span>{label}</span>
      <strong style={{ color: P.ink }}>{value}</strong>
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
    <div
      style={{
        background: P.terraSoft,
        border: `2px solid ${P.terra}`,
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
        Reset everything — one clean launch state
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
        The single step most operators want before launch. It does everything
        the cards below do in one guarded action: clears all accumulated
        history, hides the time-based &ldquo;Needs attention&rdquo; launch
        warnings, and resets the leader-care and health-check attention cards to
        a clean baseline. People, groups, leaders, memberships, settings, care
        profiles &amp; notes, and the audit log are kept. Recoverable snapshots
        are captured first — undo each piece from its own card below. Running it
        again when everything is already clean is a safe no-op.
      </p>

      {/* Impact preview. */}
      {impactUnavailable ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink2,
            margin: 0,
          }}
        >
          Impact preview unavailable — the history counts couldn&rsquo;t be
          loaded. Reset everything is disabled until they read successfully.
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
                  ? `leader care profile${surface.impactCount === 1 ? "" : "s"}`
                  : `active group${surface.impactCount === 1 ? "" : "s"}`
              }`}
            />
          ))}
        </div>
      )}

      <form action={formAction} style={{ display: "grid", gap: 10 }}>
        <div>
          <label htmlFor="reset-all-confirm" style={fieldLabelStyle}>
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
            className={fieldInputClass}
            style={fieldInputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <PButton
            type="submit"
            tone="terra"
            size="md"
            disabled={pending || !phraseMatches || impactUnavailable}
          >
            {pending ? "Resetting…" : "Reset everything"}
          </PButton>
          {state?.ok ? (
            <span style={successTextStyle}>
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
    </div>
  );
}
