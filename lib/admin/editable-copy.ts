// Editable copy (#162): pure label-key -> display-string resolution.
//
// The Super Admin Console stores operator-set copy under the `editable_copy`
// key of the Super-Admin-only platform_config row (decoded by app-config-decode).
// This module turns that stored map + a label key into the string the UI should
// render, falling back to a code-level placeholder when the key is unset — so the
// UI never renders blank. No I/O — callers load the config, this resolves it — so
// the resolution is isolation-testable.
//
// Two key families are editable (PRD #156 / closes #125's wording item):
//   * the two Group-Health 1–5 question wordings, and
//   * the five Leader-care-status display labels.

// The decoded `editable_copy` config: a map of label key -> set string. Keys not
// present (or non-string) fall back to the code placeholder.
export type EditableCopyConfig = Record<string, string>;

export type EditableCopyDefinition = {
  // Stable storage key inside the `editable_copy` config map.
  key: string;
  // Operator-facing label for the console field.
  label: string;
  // Code-level placeholder rendered when the key is unset, so the UI is never
  // blank. Doubles as the documented default wording.
  placeholder: string;
};

// Group-Health question wordings (#125). Distinct, observable facets: spiritual
// growth vs. a relayed group question (engagement). Placeholders mirror the
// labels previously hard-coded in the group-health page.
export const GROUP_HEALTH_COPY_KEYS = {
  spiritualGrowth: "group_health.spiritual_growth_question",
  groupQuestion: "group_health.group_question",
} as const;

// The five Leader-care-status display labels. Keys mirror the ShepherdCareStatus
// enum values; placeholders mirror the labels previously hard-coded in
// lib/dashboard/labels.ts.
export const CARE_STATUS_COPY_KEYS = {
  doing_well: "care_status.doing_well",
  needs_encouragement: "care_status.needs_encouragement",
  needs_follow_up: "care_status.needs_follow_up",
  concern: "care_status.concern",
  inactive: "care_status.inactive",
} as const;

export const EDITABLE_COPY_DEFINITIONS: readonly EditableCopyDefinition[] = [
  {
    key: GROUP_HEALTH_COPY_KEYS.spiritualGrowth,
    label: "Group-Health question 1 — spiritual growth (1–5)",
    placeholder: "Spiritual growth (1–5)",
  },
  {
    key: GROUP_HEALTH_COPY_KEYS.groupQuestion,
    label: "Group-Health question 2 — relayed group question (1–5)",
    placeholder: "Group engagement — leader-reported (1–5)",
  },
  {
    key: CARE_STATUS_COPY_KEYS.doing_well,
    label: "Leader care status — doing well",
    placeholder: "Doing well",
  },
  {
    key: CARE_STATUS_COPY_KEYS.needs_encouragement,
    label: "Leader care status — needs encouragement",
    placeholder: "Needs encouragement",
  },
  {
    key: CARE_STATUS_COPY_KEYS.needs_follow_up,
    label: "Leader care status — needs follow-up",
    placeholder: "Needs follow-up",
  },
  {
    key: CARE_STATUS_COPY_KEYS.concern,
    label: "Leader care status — concern",
    placeholder: "Concern",
  },
  {
    key: CARE_STATUS_COPY_KEYS.inactive,
    label: "Leader care status — inactive",
    placeholder: "Inactive",
  },
];

const DEFINITIONS_BY_KEY: ReadonlyMap<string, EditableCopyDefinition> = new Map(
  EDITABLE_COPY_DEFINITIONS.map((definition) => [definition.key, definition])
);

// Max length for any editable-copy value, enforced in the UI, the validator, and
// the SECURITY DEFINER RPC. Keep all three in sync if this changes.
export const EDITABLE_COPY_MAX_LENGTH = 200;

// Resolve a label key to the string the UI should render.
//   * a set, non-empty stored value wins;
//   * an unset key (or empty/whitespace-only value) falls back to the
//     definition's code placeholder;
//   * an unknown key (no definition) falls back to the key itself, so a caller
//     mistake is visible rather than silently blank.
export function resolveCopy(config: EditableCopyConfig, key: string): string {
  const stored = config[key];
  if (typeof stored === "string" && stored.trim().length > 0) {
    return stored;
  }
  const definition = DEFINITIONS_BY_KEY.get(key);
  return definition ? definition.placeholder : key;
}

// Look up an editable-copy definition by key, or undefined if not in the registry.
export function getEditableCopyDefinition(
  key: string
): EditableCopyDefinition | undefined {
  return DEFINITIONS_BY_KEY.get(key);
}
