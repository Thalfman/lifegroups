"use client";

import { PButton } from "@/components/pastoral/button";
import { adminResetMetricDefaults } from "@/app/(protected)/admin/settings/actions";
import { P, fontBody } from "@/lib/pastoral";
import { useActionForm, FormStatus } from "./action-form";

// Restores the documented baseline metric defaults. Per-group overrides
// in group_metric_settings are NOT touched — the confirmation copy and
// the helper text below the button both call this out so the operator
// can clear overrides separately if they want a truly clean slate.
export function ResetMetricDefaultsButton() {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminResetMetricDefaults
  );

  function confirmReset(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        "Restore the built-in metric defaults?\n\n" +
          "This resets the global thresholds (capacity, healthy attendance, " +
          "check-in due offset, missed check-in window) to their baseline " +
          "values. Per-group overrides are NOT touched — clear those " +
          "separately from the overrides list below if you also want them " +
          "cleared. This action is audited."
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <form action={formAction} onSubmit={confirmReset}>
        <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
          {pending ? "Resetting…" : "Reset defaults"}
        </PButton>
      </form>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink3,
          margin: 0,
          lineHeight: 1.4,
          maxWidth: 480,
        }}
      >
        Restores the built-in baseline (capacity 80% / 100% thresholds, 24-hour
        check-in due offset, etc.). Per-group overrides stay intact &mdash;
        clear those individually from the list below.
      </p>
      <FormStatus state={state} successText="Defaults restored." />
    </div>
  );
}
