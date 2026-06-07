// Pure logic for the Settings › Multiply tiered trigger editor (#411 / ADR 0021).
// No I/O, no React. The editor is a thin client seam over these helpers: it picks
// a LEVEL of the three-tier cascade (global → per-type → per-cell), shows the four
// pillars with each either carrying its OWN value or INHERITING its parent (labelled
// by source), and on save posts ONLY that level's payload to the matching audited
// RPC. This module owns the cascade arithmetic the editor renders and submits — the
// inheritance display, the seed values, and the per-level payloads — so all of it is
// unit-testable without a DOM. Sibling of lib/admin/cell-readiness.ts (the evaluator
// the Multiply grid runs); this is the editor-side resolver.

import type { GroupAudienceCategory } from "@/types/enums";
import type {
  CapacityRule,
  CellReadinessOverride,
  HealthRule,
  InterestRule,
  PerTypeReadinessRule,
  ReadinessLetter,
  ReadinessPillarKey,
  ReadinessRule,
} from "@/lib/admin/cell-readiness";

// The possessive Audience labels the editor shows — "Men's", "Women's", "Mixed" —
// matching the issue's dropdown copy and the Multiply per-type label map. Kept here
// so the dropdown entries and the inheritance "from …" source labels share one map.
export const TRIGGER_TYPE_LABEL: Record<GroupAudienceCategory, string> = {
  men: "Men's",
  women: "Women's",
  mixed: "Mixed",
};

// Which tier of the cascade the editor is configuring.
export type TriggerLevel =
  | { kind: "global" }
  | { kind: "type"; audience: GroupAudienceCategory }
  | { kind: "cell"; audience: GroupAudienceCategory; categoryId: string };

// Where the matching save goes — one audited RPC per tier (#410 / ADR 0021):
//   global   → admin_set_readiness_rule
//   audience → admin_set_audience_readiness_rule
//   cell     → admin_set_cell_trigger_overrides
export type SaveTarget = "global" | "audience" | "cell";

export function saveTargetForLevel(level: TriggerLevel): SaveTarget {
  switch (level.kind) {
    case "global":
      return "global";
    case "type":
      return "audience";
    case "cell":
      return "cell";
  }
}

// Encode / decode a level to the string a <select> carries. "cell:<audience>:<id>"
// — the category id is a UUID (no colons), so a plain split is safe.
export function encodeLevel(level: TriggerLevel): string {
  switch (level.kind) {
    case "global":
      return "global";
    case "type":
      return `type:${level.audience}`;
    case "cell":
      return `cell:${level.audience}:${level.categoryId}`;
  }
}

function isAudience(value: string): value is GroupAudienceCategory {
  return value === "men" || value === "women" || value === "mixed";
}

export function decodeLevel(value: string): TriggerLevel | null {
  if (value === "global") return { kind: "global" };
  const parts = value.split(":");
  if (parts[0] === "type" && parts[1] && isAudience(parts[1])) {
    return { kind: "type", audience: parts[1] };
  }
  if (parts[0] === "cell" && parts[1] && isAudience(parts[1]) && parts[2]) {
    // Re-join in case a future id ever carried a colon; UUIDs don't today.
    return {
      kind: "cell",
      audience: parts[1],
      categoryId: parts.slice(2).join(":"),
    };
  }
  return null;
}

// The four pillars' editable form fields — interest carries a COUNT (a string for
// the number input, parsed on submit), the two health pillars an A–F letter, and
// capacity neither (it is required-or-not only).
export type PillarFields = {
  interestRequired: boolean;
  interestMin: string;
  capacityRequired: boolean;
  groupRequired: boolean;
  groupMin: ReadinessLetter;
  leaderRequired: boolean;
  leaderMin: ReadinessLetter;
};

// Which pillars the level OVERRIDES (the rest inherit the parent). The global level
// is the root — every pillar is always set, so its toggles are all true.
export type PillarToggles = {
  interest: boolean;
  capacity: boolean;
  groupHealth: boolean;
  leaderHealth: boolean;
};

export const ALL_OVERRIDDEN: PillarToggles = {
  interest: true,
  capacity: true,
  groupHealth: true,
  leaderHealth: true,
};

// A non-negative integer headcount from the interest-min input, flooring an
// empty/invalid entry to 0 (the validator + RPC re-guard; keep the wire sane).
export function parseMin(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function fieldsFromRule(rule: ReadinessRule): PillarFields {
  return {
    interestRequired: rule.interest.required,
    interestMin: String(rule.interest.min),
    capacityRequired: rule.capacity.required,
    groupRequired: rule.groupHealth.required,
    groupMin: rule.groupHealth.min,
    leaderRequired: rule.leaderHealth.required,
    leaderMin: rule.leaderHealth.min,
  };
}

// The full rule jsonb from the editable fields — used for the GLOBAL level, whose
// rule is complete (every pillar set).
export function ruleFromFields(f: PillarFields): ReadinessRule {
  return {
    interest: { required: f.interestRequired, min: parseMin(f.interestMin) },
    capacity: { required: f.capacityRequired },
    groupHealth: { required: f.groupRequired, min: f.groupMin },
    leaderHealth: { required: f.leaderRequired, min: f.leaderMin },
  };
}

// Build the PARTIAL rule (a per-type rule or a per-cell override) from the toggles
// + fields: only an OVERRIDDEN pillar appears, each as a full fragment. An empty
// object means "inherit the parent for every pillar" — the save clears the level
// back to its parent (#410 / ADR 0021: an empty `{}` resets to global / per-type).
export function buildPartial(
  over: PillarToggles,
  f: PillarFields
): PerTypeReadinessRule {
  const out: PerTypeReadinessRule = {};
  if (over.interest)
    out.interest = {
      required: f.interestRequired,
      min: parseMin(f.interestMin),
    };
  if (over.capacity) out.capacity = { required: f.capacityRequired };
  if (over.groupHealth)
    out.groupHealth = { required: f.groupRequired, min: f.groupMin };
  if (over.leaderHealth)
    out.leaderHealth = { required: f.leaderRequired, min: f.leaderMin };
  return out;
}

// Which pillars a stored partial overrides (a present pillar = overridden).
export function togglesFromPartial(p: PerTypeReadinessRule): PillarToggles {
  return {
    interest: p.interest !== undefined,
    capacity: p.capacity !== undefined,
    groupHealth: p.groupHealth !== undefined,
    leaderHealth: p.leaderHealth !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Inheritance: what a level inherits per pillar when it doesn't override, and
// WHERE that inherited value comes from.
// ---------------------------------------------------------------------------

// The source of an inherited pillar: the global root, or a per-type (Audience) rule.
export type PillarSource = "global" | GroupAudienceCategory;

export function sourceLabel(source: PillarSource): string {
  return source === "global" ? "Global" : TRIGGER_TYPE_LABEL[source];
}

export type ResolvedPillar<R> = { rule: R; source: PillarSource };

// The rule a level INHERITS, per pillar, plus each pillar's source. The global level
// is the root — it has no parent (returns null). A per-type level inherits straight
// from global. A per-cell level inherits the per-type rule for any pillar that type
// overrides, else the global rule (the cascade's middle-then-top fall-through).
export type ParentRule = {
  interest: ResolvedPillar<InterestRule>;
  capacity: ResolvedPillar<CapacityRule>;
  groupHealth: ResolvedPillar<HealthRule>;
  leaderHealth: ResolvedPillar<HealthRule>;
};

export function resolveParent(
  level: TriggerLevel,
  global: ReadinessRule,
  perType: Partial<Record<GroupAudienceCategory, PerTypeReadinessRule>>
): ParentRule | null {
  if (level.kind === "global") return null;

  if (level.kind === "type") {
    return {
      interest: { rule: global.interest, source: "global" },
      capacity: { rule: global.capacity, source: "global" },
      groupHealth: { rule: global.groupHealth, source: "global" },
      leaderHealth: { rule: global.leaderHealth, source: "global" },
    };
  }

  // cell: per pillar, the per-type rule wins if it overrides that pillar; else global.
  const pt = perType[level.audience] ?? {};
  const a = level.audience;
  return {
    interest:
      pt.interest !== undefined
        ? { rule: pt.interest, source: a }
        : { rule: global.interest, source: "global" },
    capacity:
      pt.capacity !== undefined
        ? { rule: pt.capacity, source: a }
        : { rule: global.capacity, source: "global" },
    groupHealth:
      pt.groupHealth !== undefined
        ? { rule: pt.groupHealth, source: a }
        : { rule: global.groupHealth, source: "global" },
    leaderHealth:
      pt.leaderHealth !== undefined
        ? { rule: pt.leaderHealth, source: a }
        : { rule: global.leaderHealth, source: "global" },
  };
}

// Human descriptions of a resolved pillar in its NATURAL unit. Interest is always a
// COUNT (≥ N people), never a letter (#399 / ADR 0021).
export function describeInterest(rule: InterestRule): string {
  if (!rule.required) return "not required";
  return `≥ ${rule.min} ${rule.min === 1 ? "person" : "people"}`;
}

export function describeCapacity(rule: CapacityRule): string {
  return rule.required ? "no capacity issue" : "not required";
}

export function describeHealth(rule: HealthRule): string {
  return rule.required ? `≥ ${rule.min}` : "not required";
}

// The full "inherits … (from …)" line the editor shows for a pillar it doesn't
// override, e.g. "Inherits ≥ 3 people (from Global)" or "Inherits ≥ B (from Men's)".
export function pillarInheritedText(
  pillar: ReadinessPillarKey,
  parent: ParentRule
): string {
  switch (pillar) {
    case "interest":
      return `Inherits ${describeInterest(parent.interest.rule)} (from ${sourceLabel(
        parent.interest.source
      )})`;
    case "capacity":
      return `Inherits ${describeCapacity(parent.capacity.rule)} (from ${sourceLabel(
        parent.capacity.source
      )})`;
    case "groupHealth":
      return `Inherits ${describeHealth(parent.groupHealth.rule)} (from ${sourceLabel(
        parent.groupHealth.source
      )})`;
    case "leaderHealth":
      return `Inherits ${describeHealth(parent.leaderHealth.rule)} (from ${sourceLabel(
        parent.leaderHealth.source
      )})`;
  }
}

// Seed the editor's fields + toggles for a level. The global level seeds straight
// from the global rule with every pillar overridden (it is the root). A per-type /
// per-cell level seeds each pillar from its stored override where present, else from
// the inherited parent — so flipping a pillar's Override on starts from the value it
// was inheriting, and the toggles reflect what is actually stored.
export function seedFieldsForLevel(
  level: TriggerLevel,
  global: ReadinessRule,
  perType: Partial<Record<GroupAudienceCategory, PerTypeReadinessRule>>,
  cellOverride: CellReadinessOverride = {}
): { fields: PillarFields; toggles: PillarToggles } {
  if (level.kind === "global") {
    return { fields: fieldsFromRule(global), toggles: { ...ALL_OVERRIDDEN } };
  }

  const parent = resolveParent(level, global, perType);
  // parent is non-null for type/cell levels (only global returns null).
  const p = parent as ParentRule;
  const stored: PerTypeReadinessRule =
    level.kind === "type" ? (perType[level.audience] ?? {}) : cellOverride;

  const effective: ReadinessRule = {
    interest: stored.interest ?? p.interest.rule,
    capacity: stored.capacity ?? p.capacity.rule,
    groupHealth: stored.groupHealth ?? p.groupHealth.rule,
    leaderHealth: stored.leaderHealth ?? p.leaderHealth.rule,
  };

  return {
    fields: fieldsFromRule(effective),
    toggles: togglesFromPartial(stored),
  };
}
