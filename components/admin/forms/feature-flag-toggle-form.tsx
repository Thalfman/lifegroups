"use client";

import { superAdminSetFeatureFlag } from "@/app/(protected)/admin/super-admin/feature-flag-actions";
import { cn } from "@/lib/utils";
import { useActionForm, FormStatus } from "./action-form";

// Phase SAC.2 (#161): toggle a single feature flag. The hidden `enabled` field
// is the flipped value, so the server action only ever sets `enabled` (never
// `verified`).
//
// #457: the control is a switch-style submit button that shows the setting's
// current state before any interaction, instead of a bare terra "Turn on"
// button whose meaning depended on reading the row. Held (frozen-surface) flags
// carry the amber held treatment so they can't pass for an ordinary toggle.
export function FeatureFlagToggleForm({
  flagKey,
  flagLabel,
  enabled,
  held,
}: {
  flagKey: string;
  // The setting name, folded into the accessible label ("Turn on Leader
  // surface") so the repeated switches read apart in a screen reader.
  flagLabel: string;
  enabled: boolean;
  // Frozen-surface flags: the switch only stores intent — the surface stays
  // held off until verification, so the control must not look ordinary.
  held?: boolean;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    superAdminSetFeatureFlag
  );

  return (
    <form action={formAction} className="grid gap-1.5">
      <input type="hidden" name="key" value={flagKey} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`${enabled ? "Turn off" : "Turn on"} ${flagLabel}`}
        className={cn(
          "inline-flex appearance-none items-center gap-2 rounded-pill border py-1.5 pl-2 pr-3 font-sans text-xs font-semibold leading-tight transition-colors duration-150",
          held
            ? "border-amber bg-amberSoft text-amberText"
            : enabled
              ? "border-sage bg-surface text-sageDeep"
              : "border-line bg-surface text-ink2",
          pending ? "cursor-not-allowed opacity-55" : "cursor-pointer"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-flex h-[18px] w-8 shrink-0 items-center rounded-pill p-0.5 transition-colors duration-150",
            enabled ? (held ? "bg-amber" : "bg-sage") : "bg-line"
          )}
        >
          <span
            className={cn(
              "h-3.5 w-3.5 rounded-pill bg-surface shadow-soft transition-transform duration-150",
              enabled ? "translate-x-3.5" : "translate-x-0"
            )}
          />
        </span>
        <span className="whitespace-nowrap">
          {pending ? "Saving…" : enabled ? "On" : "Off"}
          {held ? " · held" : ""}
        </span>
      </button>
      <FormStatus state={state} successText="Saved." />
    </form>
  );
}
