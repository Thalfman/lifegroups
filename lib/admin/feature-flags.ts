// Feature flags (#161): pure flag definitions + resolution.
//
// Encodes ADR 0009's verify-before-flip rule in pure logic, not glue. The Super
// Admin Console stores feature-flag state under the `feature_flags` key of the
// Super-Admin-only platform_config row (decoded by app-config-decode). This
// module turns that stored state + a flag key into an effective enabled/disabled
// answer. No I/O — callers load the config, this resolves it — so the ADR 0009
// guarantee is isolation-testable and cannot be bypassed by glue.
//
// Three kinds of flag exist:
//   * new-surface flags are a plain on/off switch.
//   * frozen-surface flags gate an ADR-0002-frozen surface (the Leader surface,
//     weekly check-ins, guests). They resolve to enabled ONLY when the flag is
//     on AND a `verified` marker is present. Turning the toggle on is necessary
//     but not sufficient; the surface's routes + RLS must be re-verified (which
//     sets the `verified` marker) before the flag can actually enable it.
//   * nav-visibility flags govern a top-level nav tab that the Care/Plan/Multiply
//     pivot hides by default (Groups, People, Planning — ADR 0016). They are the
//     INVERSE of frozen-surface flags: a frozen flag re-enables an off-by-default
//     surface, whereas a nav-visibility flag concerns an on-by-default, fully
//     working surface that the pivot now hides — Tom can flip it back on without
//     a deploy, and the route always resolves by direct URL regardless. The flag
//     records "this default-hidden tab has been re-shown"; resolution treats it
//     like a plain on/off switch (enabled ⇒ tab shown), so resolveHiddenNav can
//     derive the hidden set as "every nav-visibility tab whose flag is not on".

// Stored state for a single flag. `verified` is meaningful only for
// frozen-surface flags; new-surface flags ignore it.
export type FeatureFlagState = {
  enabled: boolean;
  verified?: boolean;
};

// The decoded `feature_flags` config: a map of flag key -> stored state. Keys
// not present in the map are treated as off.
export type FeatureFlagsConfig = Record<string, FeatureFlagState>;

export type FeatureFlagKind =
  | "new_surface"
  | "frozen_surface"
  | "nav_visibility";

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
  // Nav-visibility flags (ADR 0016). The Care/Plan/Multiply pivot hides the three
  // old top-level tabs — Groups, People, Planning — by DEFAULT; each route still
  // resolves by direct URL and nothing is deleted. These flags let a Super Admin
  // re-show a hidden tab without a deploy: ON ⇒ the tab is back in nav. Default
  // off ⇒ hidden, matching the pivot. resolveHiddenNav derives the hidden-area
  // set from these; the area each governs lives in NAV_VISIBILITY_FLAGS below.
  {
    key: "nav_show_groups",
    label: "Show Groups tab",
    description:
      "Re-show the Groups tab in the admin nav. Hidden by default after the Care/Plan/Multiply pivot (ADR 0016); the route still resolves by direct URL whether or not this is on.",
    kind: "nav_visibility",
  },
  {
    key: "nav_show_people",
    label: "Show People tab",
    description:
      "Re-show the People tab in the admin nav. Hidden by default after the Care/Plan/Multiply pivot (ADR 0016); the route still resolves by direct URL whether or not this is on.",
    kind: "nav_visibility",
  },
  {
    key: "nav_show_planning",
    label: "Show Planning tab",
    description:
      "Re-show the Planning tab in the admin nav. Hidden by default after the Care/Plan/Multiply pivot (ADR 0016); the route still resolves by direct URL whether or not this is on.",
    kind: "nav_visibility",
  },
  // Launch-optics mutes (#reset-attention-metrics). Plain on/off switches that
  // hide a time-based "Needs attention" category from the admin Home queue so a
  // brand-new ministry — with no contact history, no submitted check-ins, and no
  // follow-ups — does not read as already behind on day one. Default off: every
  // category shows until a Super Admin mutes it. Suppression applies to the whole
  // admin team's Home view (see resolveMutedAttentionKeys), not just the owner's.
  {
    key: "mute_care_attention",
    label: "Mute: leaders needing care attention",
    description:
      "Hide the time-based 'Leaders needing care attention' item from the Home 'Needs attention' queue. Useful before launch, when no leader has been contacted yet.",
    kind: "new_surface",
  },
  {
    key: "mute_health_checks",
    label: "Mute: overdue or missing health checks",
    description:
      "Hide the time-based 'Overdue or missing health checks' item from the Home 'Needs attention' queue. Useful before launch, when no check-ins have been submitted yet.",
    kind: "new_surface",
  },
  {
    key: "mute_follow_ups",
    label: "Mute: open follow-ups",
    description:
      "Hide the 'Open follow-ups' item from the Home 'Needs attention' queue. Useful before launch, before any follow-ups have been created.",
    kind: "new_surface",
  },
  // Member care list (the member half of the Care area). The backend
  // (member_care_profiles / member_care_interactions + admin RPCs, admin-only
  // RLS) ships regardless; this plain on/off flag governs whether the member
  // care list SURFACES in the admin Care area. Default off ⇒ Care is leaders
  // only, exactly as today. Flipping it on is a UI-surfacing change, not a
  // schema change.
  {
    key: "care_member_list",
    label: "Member care list",
    description:
      "Show the member care list in the admin Care area, alongside the leader care list. The admin-only member-care backend exists either way; this only controls whether the surface is shown. Default off ⇒ Care is leaders only.",
    kind: "new_surface",
  },
  // Usage & login tracking (Phase USAGE.1). A plain on/off switch that gates
  // ALL coarse usage telemetry: sign-ins and which top-level area each user
  // opens. Default off ⇒ nothing is recorded. log_usage_event reads this flag
  // server-side on every call, so turning it off stops recording immediately —
  // anything after the toggle goes off is not monitored. Logs structural facts
  // only (which area), never the content a user views.
  {
    key: "usage_tracking",
    label: "Usage & login tracking",
    description:
      "Record coarse usage telemetry — sign-ins and which top-level area each user opens (Care / Plan / Multiply / Settings) — so you can see how early users are using the app. Default off; while off, nothing is recorded. Logs which area was opened, never the content viewed.",
    kind: "new_surface",
  },
];

// Maps each launch-optics mute flag to the dashboard "Needs attention" category
// key it suppresses (the keys built in lib/dashboard/needs-attention.ts). This
// is the single place the flag-key ↔ category-key mapping lives, so the registry
// and the dashboard filter can never drift.
const MUTE_FLAG_TO_ATTENTION_KEY: Record<string, string> = {
  mute_care_attention: "care_attention",
  mute_health_checks: "health",
  mute_follow_ups: "follow_ups",
};

// The launch-optics mute flag keys, in display order. Derived from the single
// flag-key ↔ category-key map above so the launch-prep card (preview) + action
// (the muted-keys it echoes) can never list a flag the dashboard filter doesn't
// honour (or miss one it does). The atomic super_admin_launch_prep RPC enables
// exactly these keys; the launch-prep migration test guards the SQL against drift.
export const LAUNCH_MUTE_FLAG_KEYS: readonly string[] = Object.keys(
  MUTE_FLAG_TO_ATTENTION_KEY
);

// The set of "Needs attention" category keys currently muted by Super-Admin
// flags. Resolved through resolveFlag, so an absent/off flag (the default)
// contributes nothing — a fresh install mutes nothing. Only the three
// time-based categories can appear here; no_leader / setup_gaps are not mutable
// by construction.
export function resolveMutedAttentionKeys(
  config: FeatureFlagsConfig
): Set<string> {
  const muted = new Set<string>();
  for (const [flagKey, attentionKey] of Object.entries(
    MUTE_FLAG_TO_ATTENTION_KEY
  )) {
    if (resolveFlag(config, flagKey)) muted.add(attentionKey);
  }
  return muted;
}

// The nav-visibility flag key ↔ the top-level area href it governs (ADR 0016).
// Single source for resolveHiddenNav; kept in lock-step with the nav-visibility
// entries in FEATURE_FLAG_DEFINITIONS and with ADMIN_AREAS' `navFlagKey` in
// lib/auth/roles.ts (a drift test guards all three from diverging).
export const NAV_VISIBILITY_FLAGS: readonly {
  key: string;
  areaHref: string;
}[] = [
  { key: "nav_show_groups", areaHref: "/admin/groups" },
  { key: "nav_show_people", areaHref: "/admin/people" },
  { key: "nav_show_planning", areaHref: "/admin/planning" },
];

// The default-hidden set: with no stored config every nav-visibility tab is
// hidden (the pivot default). Exported so nav code and tests share one baseline.
export const DEFAULT_HIDDEN_NAV_AREAS: ReadonlySet<string> = new Set(
  NAV_VISIBILITY_FLAGS.map((f) => f.areaHref)
);

// Resolve which default-hidden top-level areas are currently HIDDEN, given the
// stored feature-flag config (ADR 0016). An area is hidden unless its
// nav-visibility flag is explicitly enabled (resolveFlag), so:
//   * empty / absent config        -> all three hidden (the pivot default)
//   * nav_show_* flag on           -> that area shown (dropped from the set)
//   * unknown stored flag key      -> reveals nothing (resolveFlag fails safe);
//                                     the loop only consults known nav areas, so
//                                     a stray key can never un-hide a tab.
// Pure and total: no I/O, callers load the config and pass it in. The WRITE side
// (flipping these flags) is Super-Admin-scoped and audited via the same
// superAdminSetFeatureFlag path as every other flag — a ministry_admin cannot
// flip them (ADR 0009 / 0016).
export function resolveHiddenNav(config: FeatureFlagsConfig): Set<string> {
  const hidden = new Set<string>();
  for (const { key, areaHref } of NAV_VISIBILITY_FLAGS) {
    if (!resolveFlag(config, key)) hidden.add(areaHref);
  }
  return hidden;
}

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
