"use client";

// One-click launch prep card. The reset/Clean-Slate cards only DELETE stored
// rows, but the time-based "Needs attention" launch warnings (health checks,
// follow-ups, leader care) come from groups EXISTING WITHOUT recent activity —
// so they show even with empty history, and clearing rows never silences them.
// This card does both in one guarded step: it clears all accumulated history
// (recoverable snapshot first) AND mutes those three launch warnings, gated
// behind a PREPARE FOR LAUNCH type-to-confirm phrase re-checked server-side.

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  fieldInputClassName,
  fieldLabelClassName,
  successTextClassName,
} from "@/components/admin/forms/field-styles";
import {
  DangerCard,
  DangerSection,
} from "@/components/admin/danger-zone-card-shell";
import { cn } from "@/lib/utils";

// The Home "Needs attention" warning each launch-optics mute flag silences,
// phrased as the operator sees it on Home (not the flag's "Mute: …" label).
const LAUNCH_WARNING_LABELS: Record<string, string> = {
  mute_care_attention: "Shepherds needing care attention",
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
  const alreadyReady =
    !impactUnavailable && historyRows === 0 && remainingToMute === 0;

  const destructiveStatus = impactUnavailable
    ? ({ label: "Locked", tone: "locked" } as const)
    : alreadyReady
      ? ({ label: "Already ready", tone: "ready" } as const)
      : ({ label: "Requires confirmation", tone: "confirm" } as const);

  return (
    <DangerCard
      title="Prepare for launch — clean slate"
      intro="One step to make the app read as a fresh start on launch day. It clears all accumulated history (attendance, follow-ups, guests, group-health, status history, church-attendance snapshots, and shepherd-care activity) and hides the time-based “Needs attention” warnings that show on Home for brand-new groups. People, groups, leaders, memberships, settings, care profiles & notes, and the audit log are kept. A recoverable snapshot is captured before anything is deleted, and the warnings can be un-hidden anytime from Feature flags."
    >
      <DangerSection
        variant="destructive"
        label="Clear history & hide launch warnings"
        status={destructiveStatus}
      >
        {/* Impact preview — history that will be cleared. */}
        {impactUnavailable ? (
          <p className="m-0 font-sans text-sm text-ink2">
            Impact preview unavailable — the history counts couldn&rsquo;t be
            loaded. Launch prep is disabled until they read successfully.
          </p>
        ) : (
          <div className="grid gap-2 rounded-sm border border-line bg-surfaceAlt px-3 py-2.5">
            <div className="flex justify-between gap-3 font-sans text-xs text-ink2">
              <span>Clear accumulated history</span>
              <strong className="text-ink">
                {historyRows} row{historyRows === 1 ? "" : "s"}
              </strong>
            </div>
            <div className="grid gap-1">
              <div className="font-sans text-xs text-ink2">
                Hide launch warnings on Home
              </div>
              {warnings.map((w) => (
                <div
                  key={w.key}
                  className="flex justify-between gap-3 pl-2.5 font-sans text-xs text-ink3"
                >
                  <span>{w.label}</span>
                  <strong
                    className={cn(w.alreadyMuted ? "text-ink3" : "text-ink")}
                  >
                    {w.alreadyMuted ? "already hidden" : "will hide"}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}

        <form action={formAction} className="grid gap-2.5">
          <div>
            <label
              htmlFor="launch-prep-confirm"
              className={fieldLabelClassName}
            >
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
              {pending ? "Preparing…" : "Prepare for launch"}
            </Button>
            {state?.ok ? (
              <span className={successTextClassName}>
                {state.value.clearedRows > 0
                  ? `Cleared ${state.value.clearedRows} row${
                      state.value.clearedRows === 1 ? "" : "s"
                    } of history`
                  : "History was already clear"}
                {" · "}launch warnings hidden.
                {state.value.snapshotId
                  ? " A snapshot was saved for recovery."
                  : ""}
              </span>
            ) : null}
          </div>
          <FormStatus state={state} />
        </form>

        {/* When everything is already done, reassure rather than read as broken. */}
        {alreadyReady ? (
          <p className="m-0 font-sans text-sm text-ink2">
            Already launch-ready — there&rsquo;s no history to clear and the
            launch warnings are already hidden. Running it again is safe.
          </p>
        ) : null}
      </DangerSection>
    </DangerCard>
  );
}
