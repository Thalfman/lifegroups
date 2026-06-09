"use client";

import type { CSSProperties } from "react";
import { superAdminSetFeatureFlag } from "@/app/(protected)/admin/super-admin/feature-flag-actions";
import { P, fontSans } from "@/lib/pastoral";
import { useActionForm, FormStatus } from "./action-form";

// Phase SAC.2 (#161): toggle a single feature flag. The hidden `enabled` field
// is the flipped value, so the server action only ever sets `enabled` (never
// `verified`).
//
// #457: the control is a switch-style submit button that shows the setting's
// current state before any interaction, instead of a bare terra "Turn on"
// button whose meaning depended on reading the row. Held (frozen-surface) flags
// carry the mustard held treatment so they can't pass for an ordinary toggle.
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
    <form action={formAction} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="key" value={flagKey} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`${enabled ? "Turn off" : "Turn on"} ${flagLabel}`}
        style={switchButtonStyle(enabled, Boolean(held), pending)}
      >
        <span aria-hidden style={trackStyle(enabled, Boolean(held))}>
          <span style={knobStyle(enabled)} />
        </span>
        <span style={{ whiteSpace: "nowrap" }}>
          {pending ? "Saving…" : enabled ? "On" : "Off"}
          {held ? " · held" : ""}
        </span>
      </button>
      <FormStatus state={state} successText="Saved." />
    </form>
  );
}

function switchButtonStyle(
  enabled: boolean,
  held: boolean,
  pending: boolean
): CSSProperties {
  return {
    appearance: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px 6px 8px",
    borderRadius: 999,
    border: `1px solid ${held ? P.mustard : enabled ? P.sage : P.line}`,
    background: held ? P.mustardSoft : P.surface,
    color: held ? P.mustardTextStrong : enabled ? P.sageTextStrong : P.ink2,
    fontFamily: fontSans,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.2,
    cursor: pending ? "not-allowed" : "pointer",
    opacity: pending ? 0.55 : 1,
    transition: "background .12s, border-color .12s, color .12s, opacity .12s",
  };
}

function trackStyle(enabled: boolean, held: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    width: 32,
    height: 18,
    padding: 2,
    borderRadius: 999,
    background: enabled ? (held ? P.mustard : P.sage) : P.line,
    transition: "background .12s",
    flexShrink: 0,
  };
}

function knobStyle(enabled: boolean): CSSProperties {
  return {
    width: 14,
    height: 14,
    borderRadius: 999,
    background: P.surface,
    boxShadow: "0 1px 2px rgba(58,42,26,0.25)",
    transform: enabled ? "translateX(14px)" : "translateX(0)",
    transition: "transform .12s",
  };
}
