// Feature flags (#161): pure flag definitions + resolution.
//
// Encodes ADR 0009's verify-before-flip rule in pure logic, not glue. The Super
// Admin Console stores feature-flag state under the `feature_flags` key of the
// Super-Admin-only platform_config row (decoded by app-config-decode). This
// module turns that stored state + a flag key into an effective enabled/disabled
// answer. No I/O — callers load the config, this resolves it — so the ADR 0009
// guarantee is isolation-testable and cannot be bypassed by glue.
//
// Two kinds of flag exist:
//   * new-surface flags are a plain on/off switch.
//   * frozen-surface flags gate an ADR-0002-frozen surface (the Leader surface,
//     weekly check-ins, guests). They resolve to enabled ONLY when the flag is
//     on AND a `verified` marker is present. Turning the toggle on is necessary
//     but not sufficient; the surface's routes + RLS must be re-verified (which
//     sets the `verified` marker) before the flag can actually enable it.

// Stored state for a single flag. `verified` is meaningful only for
// frozen-surface flags; new-surface flags ignore it.
export type FeatureFlagState = {
  enabled: boolean;
  verified?: boolean;
};

// The decoded `feature_flags` config: a map of flag key -> stored state. Keys
// not present in the map are treated as off.
export type FeatureFlagsConfig = Record<string, FeatureFlagState>;

export type FeatureFlagKind = "new_surface" | "frozen_surface";

export type FeatureFlagDefinition = {
  // Stable storage key inside the `feature_flags` config map.
  key: string;
  // Operator-facing label for the console.
  label: string;
  // Operator-facing description of what the flag controls.
  description: string;
  // New-surface (plain on/off) or frozen-surface (verify-before-flip).
  kind: FeatureFlagKind;
};

// The registry of known flags. The frozen-surface flags are the ADR-0002-frozen
// surfaces named in ADR 0009; `home_hub_welcome_banner` is a new-surface flag
// used as the end-to-end tracer.
export const FEATURE_FLAG_DEFINITIONS: readonly FeatureFlagDefinition[] = [
  {
    key: "home_hub_welcome_banner",
    label: "Home Hub welcome banner",
    description:
      "Show a welcome banner in the Super Admin Console preview. A plain on/off new-surface flag used as the end-to-end tracer.",
    kind: "new_surface",
  },
  {
    key: "leader_surface",
    label: "Leader surface",
    description:
      "Re-enable the frozen Leader-facing surface (ADR 0002). Requires route + RLS re-verification before the toggle can take effect.",
    kind: "frozen_surface",
  },
  {
    key: "check_ins",
    label: "Weekly check-ins",
    description:
      "Re-enable the frozen weekly check-in surface (ADR 0002). Requires route + RLS re-verification before the toggle can take effect.",
    kind: "frozen_surface",
  },
  {
    key: "guests",
    label: "Guests",
    description:
      "Re-enable the frozen guest surface (ADR 0002). Requires route + RLS re-verification before the toggle can take effect.",
    kind: "frozen_surface",
  },
];

const DEFINITIONS_BY_KEY: ReadonlyMap<string, FeatureFlagDefinition> = new Map(
  FEATURE_FLAG_DEFINITIONS.map((definition) => [definition.key, definition])
);

// Look up a flag definition by key, or undefined if it is not in the registry.
export function getFeatureFlagDefinition(
  key: string
): FeatureFlagDefinition | undefined {
  return DEFINITIONS_BY_KEY.get(key);
}

// Whether a flag key names a frozen surface (verify-before-flip applies).
export function isFrozenSurfaceFlag(key: string): boolean {
  return DEFINITIONS_BY_KEY.get(key)?.kind === "frozen_surface";
}

// Resolve whether a flag is *effectively* enabled for a given stored config.
//
// Resolution table (the ADR 0009 guarantee):
//   * flag off (or unset)                   -> disabled
//   * new-surface flag on                   -> enabled
//   * frozen-surface flag on, not verified  -> disabled
//   * frozen-surface flag on, verified      -> enabled
//   * unknown key (not in the registry)     -> disabled (fail safe)
export function resolveFlag(config: FeatureFlagsConfig, key: string): boolean {
  const state = config[key];
  if (!state || !state.enabled) {
    return false;
  }

  const definition = DEFINITIONS_BY_KEY.get(key);
  if (!definition) {
    // A stored flag we do not recognise is treated as disabled: a flag can
    // never enable a surface the code does not know how to guard.
    return false;
  }

  if (definition.kind === "frozen_surface") {
    return state.verified === true;
  }

  return true;
}
