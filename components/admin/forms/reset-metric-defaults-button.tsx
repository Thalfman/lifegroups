"use client";

import { adminResetMetricDefaults } from "@/app/(protected)/admin/settings/actions";
import { ConfirmActionButton } from "./confirm-action-button";

// Restores the documented baseline metric defaults. Per-group overrides
// in group_metric_settings are NOT touched — the confirmation copy and
// the helper text below the button both call this out so the operator
// can clear overrides separately if they want a truly clean slate.

// Exported so the copy stays byte-locked by the confirm-action-button test.
export const resetMetricDefaultsConfirmMessage =
  "Restore the built-in metric defaults?\n\n" +
  "This resets the global thresholds (capacity, healthy attendance, " +
  "check-in due offset, missed check-in window) to their baseline " +
  "values. Per-group overrides are NOT touched — clear those " +
  "separately from the overrides list below if you also want them " +
  "cleared. This action is audited.";

export function ResetMetricDefaultsButton() {
  return (
    <ConfirmActionButton
      action={adminResetMetricDefaults}
      confirmMessage={resetMetricDefaultsConfirmMessage}
      idleLabel="Reset defaults"
      pendingLabel="Resetting…"
      variant="ghost"
      gap={8}
      alignEnd={false}
      successText="Defaults restored."
      helperText={
        <p className="m-0 max-w-[480px] font-sans text-xs text-ink3">
          Restores the built-in baseline (capacity 80% / 100% thresholds,
          24-hour check-in due offset, etc.). Per-group overrides stay intact
          &mdash; clear those individually from the list below.
        </p>
      }
    />
  );
}
