"use client";

// One-click launch prep card. The reset/Clean-Slate cards only DELETE stored
// rows, but the time-based "Needs attention" launch warnings (health checks,
// follow-ups, leader care) come from groups EXISTING WITHOUT recent activity —
// so they show even with empty history, and clearing rows never silences them.
// This card does both in one guarded step: it clears all accumulated history
// (recoverable snapshot first) AND mutes those three launch warnings, gated
// behind a PREPARE FOR LAUNCH type-to-confirm phrase re-checked server-side.

import { useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { superAdminLaunchPrep } from "@/app/(protected)/admin/super-admin/launch-prep-actions";
import {
  LAUNCH_PREP_CONFIRM_PHRASE,
  type LaunchPrepSuccess,
} from "@/lib/admin/danger-zone";
import {
  LAUNCH_MUTE_FLAG_KEYS,
  resolveFlag,
  type FeatureFlagsConfig,
} from "@/lib/admin/feature-flags";
import type { CleanSlateImpact } from "@/lib/supabase/maintenance-reads";
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
// phrased as the operator sees it on Home (not the flag's "Mute: …" label).
const LAUNCH_WARNING_LABELS: Record<string, string> = {
  mute_care_attention: "Leaders needing care attention",
  mute_health_checks: "Overdue or missing health checks",
  mute_follow_ups: "Open follow-ups",
};

export function LaunchPrepCard({
  impact,
  featureFlags,
}: {
  impact: CleanSlateImpact | null;
  featureFlags: FeatureFlagsConfig;
}) {
  const { state, formAction, pending } =
    useActionForm<LaunchPrepSuccess>(superAdminLaunchPrep);
  const [confirm, setConfirm] = useState("");

  const phraseMatches = confirm.trim() === LAUNCH_PREP_CONFIRM_PHRASE;
  const historyRows = impact?.total ?? 0;
  // The wipe step needs the impact read to have succeeded; the mute step doesn't,
  // but we gate the whole action on a clean read so the preview can't mislead.
  const impactUnavailable = impact === null;
  const warnings = LAUNCH_MUTE_FLAG_KEYS.map((key) => ({
    key,
    label: LAUNCH_WARNING_LABELS[key] ?? key,
    alreadyMuted: resolveFlag(featureFlags, key),
  }));
  const remainingToMute = warnings.filter((w) => !w.alreadyMuted).length;

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
        Prepare for launch — clean slate
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
        One step to make the app read as a fresh start on launch day. It clears
        all accumulated history (attendance, follow-ups, guests, group-health,
        status history, church-attendance snapshots, and shepherd-care activity)
        and hides the time-based &ldquo;Needs attention&rdquo; warnings that
        show on Home for brand-new groups. People, groups, leaders, memberships,
        settings, care profiles &amp; notes, and the audit log are kept. A
        recoverable snapshot is captured before anything is deleted, and the
        warnings can be un-hidden anytime from Feature flags.
      </p>

      {/* Impact preview — history that will be cleared. */}
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
          loaded. Launch prep is disabled until they read successfully.
        </p>
      ) : (
        <div
          style={{
            border: `1px solid ${P.line}`,
            borderRadius: 8,
            background: P.surface,
            padding: "10px 12px",
            display: "grid",
            gap: 8,
          }}
        >
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
            <span>Clear accumulated history</span>
            <strong style={{ color: P.ink }}>
              {historyRows} row{historyRows === 1 ? "" : "s"}
            </strong>
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <div
              style={{
                fontFamily: fontSans,
                fontSize: 12,
                color: P.ink2,
              }}
            >
              Hide launch warnings on Home
            </div>
            {warnings.map((w) => (
              <div
                key={w.key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  fontFamily: fontSans,
                  fontSize: 12,
                  color: P.ink3,
                  paddingLeft: 10,
                }}
              >
                <span>{w.label}</span>
                <strong style={{ color: w.alreadyMuted ? P.ink3 : P.ink }}>
                  {w.alreadyMuted ? "already hidden" : "will hide"}
                </strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <form action={formAction} style={{ display: "grid", gap: 10 }}>
        <div>
          <label htmlFor="launch-prep-confirm" style={fieldLabelStyle}>
            Type {LAUNCH_PREP_CONFIRM_PHRASE} to confirm
          </label>
          <input
            id="launch-prep-confirm"
            name="confirm"
            type="text"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={LAUNCH_PREP_CONFIRM_PHRASE}
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
            {pending ? "Preparing…" : "Prepare for launch"}
          </PButton>
          {state?.ok ? (
            <span style={successTextStyle}>
              {state.value.clearedRows > 0
                ? `Cleared ${state.value.clearedRows} row${
                    state.value.clearedRows === 1 ? "" : "s"
                  } of history`
                : "History was already clear"}
              {" · "}launch warnings hidden. A snapshot was saved for recovery.
            </span>
          ) : null}
        </div>
        <FormStatus state={state} />
      </form>

      {/* When everything is already done, reassure rather than read as broken. */}
      {!impactUnavailable && historyRows === 0 && remainingToMute === 0 ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink2,
            margin: 0,
          }}
        >
          Already launch-ready — there&rsquo;s no history to clear and the
          launch warnings are already hidden. Running it again is safe.
        </p>
      ) : null}
    </div>
  );
}
