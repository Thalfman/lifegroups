import type { StatusTone } from "@/components/admin/console-status";
import {
  FEATURE_FLAG_DEFINITIONS,
  resolveFlag,
  type FeatureFlagDefinition,
  type FeatureFlagsConfig,
} from "@/lib/admin/feature-flags";

// Display state for the Super Admin Console's Feature flags card: turns each
// registry definition + the stored config into the badges, risk note, and
// toggle inputs the row renders. Pure — resolution stays in
// lib/admin/feature-flags (the ADR 0009 table); this module only words it for
// the operator, so the badge/risk branching is unit-testable without
// rendering.

export type FeatureFlagBadge = { label: string; tone: StatusTone };

export type FeatureFlagRowView = {
  key: string;
  label: string;
  description: string;
  // Frozen-surface rows carry the amber "watch" tint and a held toggle.
  frozen: boolean;
  // The raw stored switch position, which the toggle form reflects — for a
  // frozen surface this can be on while the effective state stays held off.
  enabled: boolean;
  // The flag kind in operator terms (#461): "Held" / "Nav" / "Standard"
  // rather than the internal kind names.
  kindBadge: FeatureFlagBadge;
  // The effective state, readable before touching the switch (#457). Frozen
  // surfaces distinguish "on but held pending verification" (warning) from
  // "locked off" (guarded — protected on purpose).
  stateBadge: FeatureFlagBadge;
  // heldOff marks the amber-emphasised "turned on, but held" wording.
  riskNote: { text: string; heldOff: boolean } | null;
};

export function buildFeatureFlagRow(
  definition: FeatureFlagDefinition,
  flags: FeatureFlagsConfig
): FeatureFlagRowView {
  const resolved = resolveFlag(flags, definition.key);
  const state = flags[definition.key];
  const enabled = state?.enabled === true;
  const frozen = definition.kind === "frozen_surface";
  const navVis = definition.kind === "nav_visibility";
  const frozenHeldOff = frozen && enabled && state?.verified !== true;
  const riskNoteText = frozenHeldOff
    ? "Turned on, but held off until it passes its safety review."
    : frozen
      ? "Held — stays off until it passes a safety review, even when switched on."
      : navVis
        ? "Hiding the tab does not block access — anyone with the page's address can still open it."
        : null;

  return {
    key: definition.key,
    label: definition.label,
    description: definition.description,
    frozen,
    enabled,
    kindBadge: {
      label: frozen ? "Held" : navVis ? "Nav" : "Standard",
      tone: frozen ? "warning" : "planned",
    },
    stateBadge: {
      label: frozen
        ? resolved
          ? "On"
          : enabled
            ? "Held off"
            : "Locked off"
        : resolved
          ? navVis
            ? "Shown"
            : "On"
          : navVis
            ? "Hidden"
            : "Off",
      tone: frozen
        ? resolved
          ? "good"
          : enabled
            ? "warning"
            : "guarded"
        : resolved
          ? "good"
          : "disabled",
    },
    riskNote: riskNoteText
      ? { text: riskNoteText, heldOff: frozenHeldOff }
      : null,
  };
}

// The whole card: every registry flag, in registry (display) order.
export function buildFeatureFlagRows(
  flags: FeatureFlagsConfig
): FeatureFlagRowView[] {
  return FEATURE_FLAG_DEFINITIONS.map((definition) =>
    buildFeatureFlagRow(definition, flags)
  );
}
