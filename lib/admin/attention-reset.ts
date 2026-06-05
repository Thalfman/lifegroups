// Attention-reset registry + pure baseline resolution (health-checks-reset).
//
// The admin Home "Needs attention" queue surfaces two duration-derived cards —
// "overdue or missing health checks" and "leaders needing care" — computed from
// elapsed time, not from a dismissible event. The existing danger-zone tools
// (Clean Slate wipe, per-category reset, Launch prep) only DELETE history rows;
// they keep shepherd_care_profiles and cannot clear the absence-derived health
// "missing" signal, so the only thing that ever cleared those cards was the mute
// feature flag — a hide, not a reset.
//
// A reset baseline is an "as-of" date the pure derivations measure from:
// anything at/before the baseline reads as "not behind". Stored per surface,
// either as a single global row or a per-entity override (a shepherd profile id
// for care, a group id for health). This module is the pure source of truth
// shared by the migration test, the read layer, the derivations, and the UI —
// no I/O.

export const ATTENTION_RESET_SURFACES = ["care", "health"] as const;
export type AttentionResetSurface = (typeof ATTENTION_RESET_SURFACES)[number];

export const ATTENTION_RESET_SCOPES = ["global", "entity"] as const;
export type AttentionResetScope = (typeof ATTENTION_RESET_SCOPES)[number];

export function isAttentionResetSurface(
  value: unknown
): value is AttentionResetSurface {
  return (
    typeof value === "string" &&
    (ATTENTION_RESET_SURFACES as readonly string[]).includes(value)
  );
}

export function isAttentionResetScope(
  value: unknown
): value is AttentionResetScope {
  return (
    typeof value === "string" &&
    (ATTENTION_RESET_SCOPES as readonly string[]).includes(value)
  );
}

// Operator-facing copy per surface, shown on the reset cards. The wording makes
// clear this is a fresh start that re-surfaces naturally — NOT a permanent hide
// (which is what the mute flags do).
export const ATTENTION_RESET_SURFACE_META: Record<
  AttentionResetSurface,
  { label: string; description: string }
> = {
  care: {
    label: "Leader care attention",
    description:
      "Reset the care clock so no leader reads as overdue right now. Clears each leader's next touchpoint and returns their status to “doing well”, then re-surfaces naturally as real time passes.",
  },
  health: {
    label: "Health checks",
    description:
      "Reset the health-check clock so no group reads as an overdue or missing check right now, and clear any open “needs follow-up” flags. Re-surfaces naturally once a new due week passes without a submission.",
  },
};

// The effective baselines for a surface: a single global baseline date (or null)
// plus per-entity overrides keyed by the entity id (shepherd profile id for
// care, group id for health). All dates are ISO YYYY-MM-DD strings.
export type AttentionBaselines = {
  global: string | null;
  byEntityId: ReadonlyMap<string, string>;
};

export const EMPTY_ATTENTION_BASELINES: AttentionBaselines = {
  global: null,
  byEntityId: new Map(),
};

// Resolve the effective baseline for one entity: its own override if present,
// else the surface's global baseline, else null. Null means "no baseline" —
// today's behaviour, fully backward-compatible.
export function resolveAttentionBaseline(
  baselines: AttentionBaselines | null | undefined,
  entityId: string
): string | null {
  if (!baselines) return null;
  return baselines.byEntityId.get(entityId) ?? baselines.global;
}

// One stored baseline row, narrowed to the fields the split needs. Structurally
// assignable from AttentionResetBaselinesRow.
export type AttentionResetBaselineRowLike = {
  surface: string;
  scope: string;
  entity_id: string | null;
  baseline_on: string;
};

// Split the flat baseline rows into the AttentionBaselines for ONE surface.
// `mapDate` transforms the stored YYYY-MM-DD baseline before it lands in the
// maps — care passes it through (it floors a last-contact date), health maps it
// to its ISO week-start so the dashboard's `selectedWeek <= baseline` compare is
// a pure string compare. A malformed row (entity scope with no id, or vice
// versa) is skipped rather than trusted.
export function buildSurfaceBaselines(
  rows: readonly AttentionResetBaselineRowLike[],
  surface: AttentionResetSurface,
  mapDate: (iso: string) => string = (iso) => iso
): AttentionBaselines {
  let global: string | null = null;
  const byEntityId = new Map<string, string>();
  for (const row of rows) {
    if (row.surface !== surface) continue;
    const value = mapDate(row.baseline_on);
    if (row.scope === "global" && row.entity_id === null) {
      global = value;
    } else if (row.scope === "entity" && row.entity_id) {
      byEntityId.set(row.entity_id, value);
    }
  }
  return { global, byEntityId };
}
