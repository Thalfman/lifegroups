// Per-cell readiness rule — pure resolver (#402 / PRD §2.4). No I/O, no Supabase.
//
// This is the RECAST multiply readiness trigger: each pillar reads in its NATURAL
// unit, evaluated PER CELL, configured once GLOBALLY with PER-CELL OVERRIDES.
//
//   | Pillar       | Unit                         |
//   | ------------ | ---------------------------- |
//   | interest     | number of people (#399)      |
//   | capacity     | derived issue / no-issue (#401) |
//   | groupHealth  | A–F letter                   |
//   | leaderHealth | A–F letter                   |
//
// The `overflow` pillar is GONE (folded into capacity Facet A, retired #401). The
// rule marks EACH pillar required-or-not and sets its threshold (interest ≥ N;
// capacity required/not; health ≥ letter). A cell reads "ready" when EVERY
// *required* pillar clears; pillars that are not required are ignored.
//
// Relationship to lib/admin/multiplication-pillars.ts: that module's letter-banded
// `evaluateTrigger` drives the INTERIM per-type Multiply boards (men/women/mixed).
// THIS module is the new canonical per-cell readiness, edited in Settings > Groups
// (global rule + per-cell override rows). The per-type boards become the per-cell
// Multiply GRID driven by this engine in a later slice (#403); until then both
// coexist by design, as the board comments note. This module is a sibling of
// lib/admin/cell-capacity.ts and lib/admin/cell-coverage.ts — the per-cell family.

import { HEALTH_GRADE_LADDER } from "@/lib/admin/health-rubric";
import type { GroupHealthLetter } from "@/types/enums";

// The A–F letter the health pillars read in. Reuses the health-rubric ladder's
// letter so readiness, the board pillars, and the Health rubric share one A–F
// vocabulary.
export type ReadinessLetter = GroupHealthLetter;

// The four readiness pillars. Capacity is a boolean issue (no threshold); the
// other three carry a threshold in their natural unit.
export type ReadinessPillarKey =
  | "interest"
  | "capacity"
  | "groupHealth"
  | "leaderHealth";

// Per-pillar rule fragments, each in its NATURAL unit.
//   * Interest: required + a minimum HEADCOUNT (interest ≥ min PEOPLE).
//   * Capacity: required only — the derived per-cell issue either blocks or not.
//   * Health:   required + a minimum A–F LETTER (health ≥ min).
export type InterestRule = { required: boolean; min: number };
export type CapacityRule = { required: boolean };
export type HealthRule = { required: boolean; min: ReadinessLetter };

// The whole readiness rule: one fragment per pillar. The GLOBAL rule has this
// exact shape; a per-cell override is a PARTIAL of it (see CellReadinessOverride).
export type ReadinessRule = {
  interest: InterestRule;
  capacity: CapacityRule;
  groupHealth: HealthRule;
  leaderHealth: HealthRule;
};

// A per-cell override OVER the global rule. Any pillar PRESENT here replaces the
// global rule's pillar WHOLESALE; an ABSENT pillar inherits the global one. So an
// empty override `{}` means "this cell follows the global rule for every pillar".
export type CellReadinessOverride = Partial<ReadinessRule>;

// A per-TYPE (Audience) rule — the MIDDLE tier of the three-tier cascade
// (global → per-type → per-cell, #410 / ADR 0021). Structurally identical to a
// per-cell override: a PARTIAL of the global rule where a present pillar overrides
// it for every cell of that Audience, and an absent pillar inherits the global
// one. An empty `{}` means "this type follows the global rule for every pillar".
export type PerTypeReadinessRule = Partial<ReadinessRule>;

// The per-cell inputs in natural units. Interest is the cell's interested-prospect
// headcount (#399); capacityIssue is the cell's derived capacity issue (#401);
// the two health letters are the cell's rolled-up A–F grades (null = "—",
// ungraded).
export type CellReadinessInputs = {
  interestCount: number;
  capacityIssue: boolean;
  groupHealth: ReadinessLetter | null;
  leaderHealth: ReadinessLetter | null;
};

// Per-pillar outcome of evaluating the rule: whether the pillar was required and
// whether it cleared. A not-required pillar is "ignored" (counts as neither a
// clear nor a blocker). A required pillar is "cleared" or "blocked".
export type ReadinessOutcomeStatus = "cleared" | "blocked" | "ignored";

export type ReadinessOutcome = {
  pillar: ReadinessPillarKey;
  required: boolean;
  status: ReadinessOutcomeStatus;
};

export type CellReadinessSignal = {
  // The headline: is this cell ready to multiply? True iff every REQUIRED pillar
  // cleared. There is no blended grade — the rule is the only roll-up.
  ready: boolean;
  // Per-pillar detail in a stable order, so the UI can show WHY a cell is or isn't
  // ready (which required pillars cleared, which blocked, which were ignored).
  outcomes: ReadinessOutcome[];
  // The required pillars that fell short, for a compact blocker summary.
  blockers: ReadinessPillarKey[];
};

// The built-in default rule (PRD §4.1): interest required at a small N, capacity
// required, health NOT required until grades exist. Used when no global rule has
// been saved yet, and as the per-pillar fallback for malformed stored fragments.
export const BUILT_IN_READINESS_RULE: ReadinessRule = {
  interest: { required: true, min: 3 },
  capacity: { required: true },
  groupHealth: { required: false, min: "C" },
  leaderHealth: { required: false, min: "C" },
};

// The pillars evaluated in their stable display/outcome order.
const READINESS_PILLARS: readonly ReadinessPillarKey[] = [
  "interest",
  "capacity",
  "groupHealth",
  "leaderHealth",
];

// ---------------------------------------------------------------------------
// Cascade resolution — the ONE home of the three-tier fall-through (#487).
// ---------------------------------------------------------------------------

// Which TIER of the cascade a resolved pillar's value came from: the global
// root, the Audience's per-type rule, or the cell's own override. The Multiply
// grid evaluator ignores the source (it needs only the effective rule — see
// resolveReadinessRule); the Settings trigger editor consumes it for its
// "Inherits … (from …)" labels (lib/admin/multiply-trigger.ts).
export type ReadinessRuleSource = "global" | "type" | "cell";

// One pillar's resolved rule fragment plus where it came from.
export type ResolvedReadinessPillar<R> = {
  rule: R;
  source: ReadinessRuleSource;
};

// The whole rule resolved PER PILLAR with source attribution.
export type ResolvedReadinessRule = {
  interest: ResolvedReadinessPillar<InterestRule>;
  capacity: ResolvedReadinessPillar<CapacityRule>;
  groupHealth: ResolvedReadinessPillar<HealthRule>;
  leaderHealth: ResolvedReadinessPillar<HealthRule>;
};

// One pillar's fall-through: the cell override wins; else the per-type rule;
// else the global rule — and the tier that supplied the value is the source.
function resolvePillar<R>(
  global: R,
  perType: R | undefined,
  cell: R | undefined
): ResolvedReadinessPillar<R> {
  if (cell !== undefined) return { rule: cell, source: "cell" };
  if (perType !== undefined) return { rule: perType, source: "type" };
  return { rule: global, source: "global" };
}

// Resolve a cell's EFFECTIVE rule down the THREE-TIER cascade (#410 / ADR 0021),
// PER PILLAR, attributing each pillar's SOURCE: a per-cell override wins; else
// the per-type (Audience) rule; else the global rule. Each tier above per-cell
// is a PARTIAL, so a pillar absent from both the cell override and the per-type
// rule falls through to the global rule. The canonical resolution every surface
// shares (#487) — the evaluator path drops the sources via resolveReadinessRule;
// the trigger editor's inheritance display reads them. Pure — returns a fresh
// rule, mutating none of its inputs.
export function resolveReadinessRuleWithSources(
  global: ReadinessRule,
  perType: PerTypeReadinessRule,
  cell: CellReadinessOverride
): ResolvedReadinessRule {
  return {
    interest: resolvePillar(global.interest, perType.interest, cell.interest),
    capacity: resolvePillar(global.capacity, perType.capacity, cell.capacity),
    groupHealth: resolvePillar(
      global.groupHealth,
      perType.groupHealth,
      cell.groupHealth
    ),
    leaderHealth: resolvePillar(
      global.leaderHealth,
      perType.leaderHealth,
      cell.leaderHealth
    ),
  };
}

// The source-IGNORING projection of resolveReadinessRuleWithSources — the shape
// the evaluator runs (evaluateCellReadiness needs only the effective rule).
export function resolveReadinessRule(
  global: ReadinessRule,
  perType: PerTypeReadinessRule,
  cell: CellReadinessOverride
): ReadinessRule {
  const resolved = resolveReadinessRuleWithSources(global, perType, cell);
  return {
    interest: resolved.interest.rule,
    capacity: resolved.capacity.rule,
    groupHealth: resolved.groupHealth.rule,
    leaderHealth: resolved.leaderHealth.rule,
  };
}

// Resolve a cell's EFFECTIVE rule by laying its override over the global rule,
// per pillar: a pillar present in the override wins; an absent pillar inherits the
// global one. The two-tier shorthand for resolveReadinessRule with no per-type
// rule (every pillar inherits straight from global). Pure.
export function resolveCellRule(
  global: ReadinessRule,
  override: CellReadinessOverride
): ReadinessRule {
  return resolveReadinessRule(global, {}, override);
}

// Whether an A–F letter is AT LEAST as good as a minimum. The ladder is best→worst
// (A first), so "at least min" means a SMALLER-or-equal index.
function letterAtLeast(actual: ReadinessLetter, min: ReadinessLetter): boolean {
  return (
    HEALTH_GRADE_LADDER.indexOf(actual) <= HEALTH_GRADE_LADDER.indexOf(min)
  );
}

// Evaluate a cell's EFFECTIVE rule against its natural-unit inputs. A cell is ready
// iff every REQUIRED pillar clears:
//   * interest — clears when the headcount is at least the minimum (interest ≥ N).
//   * capacity — clears when there is NO capacity issue (required ⇒ no issue).
//   * health   — clears when the cell's letter is graded AND at least the minimum;
//                an ungraded (null) required health pillar NEVER clears — it blocks
//                until a grade exists (the rule's `required` flag is the deliberate
//                "demand grades" lever, mirroring the board's requireHealthGrades).
// A not-required pillar is ignored entirely. Pass the EFFECTIVE rule (see
// resolveCellRule) so per-cell overrides are already folded in.
export function evaluateCellReadiness(
  rule: ReadinessRule,
  inputs: CellReadinessInputs
): CellReadinessSignal {
  const cleared: Record<ReadinessPillarKey, boolean> = {
    interest:
      Number.isFinite(inputs.interestCount) &&
      inputs.interestCount >= rule.interest.min,
    // Capacity "clears" when there is no issue. A required capacity pillar blocks
    // when an issue is present (over-capacity OR thin availability, #401).
    capacity: !inputs.capacityIssue,
    groupHealth:
      inputs.groupHealth !== null &&
      letterAtLeast(inputs.groupHealth, rule.groupHealth.min),
    leaderHealth:
      inputs.leaderHealth !== null &&
      letterAtLeast(inputs.leaderHealth, rule.leaderHealth.min),
  };
  const required: Record<ReadinessPillarKey, boolean> = {
    interest: rule.interest.required,
    capacity: rule.capacity.required,
    groupHealth: rule.groupHealth.required,
    leaderHealth: rule.leaderHealth.required,
  };

  const outcomes: ReadinessOutcome[] = [];
  const blockers: ReadinessPillarKey[] = [];
  for (const pillar of READINESS_PILLARS) {
    const isRequired = required[pillar];
    const didClear = cleared[pillar];
    const status: ReadinessOutcomeStatus = !isRequired
      ? "ignored"
      : didClear
        ? "cleared"
        : "blocked";
    outcomes.push({ pillar, required: isRequired, status });
    if (isRequired && !didClear) blockers.push(pillar);
  }

  return { ready: blockers.length === 0, outcomes, blockers };
}

// ---------------------------------------------------------------------------
// Trust-boundary decoders: raw jsonb (read as `unknown`) → typed rule / override.
// ---------------------------------------------------------------------------
// Each decoder shapes a stored jsonb payload into the clean type, falling back to
// the built-in default for any malformed field rather than throwing — a partially-
// corrupt row still evaluates sanely. The single decode shared by the Settings
// read, the write validators, and any future grid read (#403).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLetter(value: unknown): value is ReadinessLetter {
  return (
    typeof value === "string" &&
    HEALTH_GRADE_LADDER.includes(value as ReadinessLetter)
  );
}

// Each field decoder takes an optional `onFallback` callback, invoked whenever a
// stored value could not be read and the fallback was used instead. The plain
// decoders (no callback) keep their exact pre-#473 behavior; only the
// decode-with-report path below passes one.

function boolOr(
  value: unknown,
  fallback: boolean,
  onFallback?: () => void
): boolean {
  if (typeof value === "boolean") return value;
  onFallback?.();
  return fallback;
}

// A non-negative integer headcount, defaulting a missing / invalid value to the
// fallback. Interest is a count of PEOPLE, so it is floored at 0 and truncated.
// Truncating a fractional count is benign normalization, NOT a fallback.
function minCountOr(
  value: unknown,
  fallback: number,
  onFallback?: () => void
): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  onFallback?.();
  return fallback;
}

function letterOr(
  value: unknown,
  fallback: ReadinessLetter,
  onFallback?: () => void
): ReadinessLetter {
  if (isLetter(value)) return value;
  onFallback?.();
  return fallback;
}

function decodeInterestRule(
  raw: unknown,
  fallback: InterestRule,
  onFallback?: () => void
): InterestRule {
  if (!isRecord(raw)) {
    onFallback?.();
    return fallback;
  }
  return {
    required: boolOr(raw.required, fallback.required, onFallback),
    min: minCountOr(raw.min, fallback.min, onFallback),
  };
}

function decodeCapacityRule(
  raw: unknown,
  fallback: CapacityRule,
  onFallback?: () => void
): CapacityRule {
  if (!isRecord(raw)) {
    onFallback?.();
    return fallback;
  }
  return { required: boolOr(raw.required, fallback.required, onFallback) };
}

function decodeHealthRule(
  raw: unknown,
  fallback: HealthRule,
  onFallback?: () => void
): HealthRule {
  if (!isRecord(raw)) {
    onFallback?.();
    return fallback;
  }
  return {
    required: boolOr(raw.required, fallback.required, onFallback),
    min: letterOr(raw.min, fallback.min, onFallback),
  };
}

// The decode-with-report shape for the stored GLOBAL rule (#473): the decoded
// rule plus whether any part of a PRESENT stored payload was unreadable and fell
// back to the built-in default. Lets the Settings Multiply tab and the Multiply
// readiness surface warn that the stored trigger couldn't be read (and that
// saving will overwrite it) instead of silently showing default values.
export type ReadinessRuleDecode = {
  rule: ReadinessRule;
  fellBack: boolean;
};

// Decode the stored GLOBAL rule jsonb, REPORTING whether any of it fell back.
//   * MISSING (null / undefined) is NOT corrupt — a fresh ministry has no stored
//     rule until one is saved, so the built-in default is the legitimate value
//     and fellBack stays false.
//   * A present payload that is not an object, is missing a pillar, or carries a
//     malformed field reports fellBack: true — the writes always store the full
//     four-pillar rule, so anything less means the stored trigger couldn't be
//     read faithfully.
// The decoded rule VALUE is identical to decodeReadinessRule's — only the report
// is added.
export function decodeReadinessRuleWithReport(
  raw: unknown
): ReadinessRuleDecode {
  if (raw === null || raw === undefined) {
    return { rule: BUILT_IN_READINESS_RULE, fellBack: false };
  }
  if (!isRecord(raw)) {
    return { rule: BUILT_IN_READINESS_RULE, fellBack: true };
  }
  let fellBack = false;
  const flag = () => {
    fellBack = true;
  };
  const rule: ReadinessRule = {
    interest: decodeInterestRule(
      raw.interest,
      BUILT_IN_READINESS_RULE.interest,
      flag
    ),
    capacity: decodeCapacityRule(
      raw.capacity,
      BUILT_IN_READINESS_RULE.capacity,
      flag
    ),
    groupHealth: decodeHealthRule(
      raw.groupHealth,
      BUILT_IN_READINESS_RULE.groupHealth,
      flag
    ),
    leaderHealth: decodeHealthRule(
      raw.leaderHealth,
      BUILT_IN_READINESS_RULE.leaderHealth,
      flag
    ),
  };
  return { rule, fellBack };
}

// Decode the stored GLOBAL rule jsonb into a full ReadinessRule, defaulting each
// missing / malformed pillar fragment to the built-in. The report-free shape of
// decodeReadinessRuleWithReport — same fallback value, no fellBack flag.
export function decodeReadinessRule(raw: unknown): ReadinessRule {
  return decodeReadinessRuleWithReport(raw).rule;
}

// Decode the stored per-cell `trigger_overrides` jsonb into a CellReadinessOverride.
// Only a pillar PRESENT (as an object) in the raw payload is decoded into the
// override; an absent pillar is omitted entirely so it INHERITS the global rule.
// Each present-but-malformed fragment falls back to the built-in pillar values
// (defensive), but its mere presence still marks the pillar as overridden.
export function decodeCellOverride(raw: unknown): CellReadinessOverride {
  if (!isRecord(raw)) return {};
  const out: CellReadinessOverride = {};
  if (isRecord(raw.interest)) {
    out.interest = decodeInterestRule(
      raw.interest,
      BUILT_IN_READINESS_RULE.interest
    );
  }
  if (isRecord(raw.capacity)) {
    out.capacity = decodeCapacityRule(
      raw.capacity,
      BUILT_IN_READINESS_RULE.capacity
    );
  }
  if (isRecord(raw.groupHealth)) {
    out.groupHealth = decodeHealthRule(
      raw.groupHealth,
      BUILT_IN_READINESS_RULE.groupHealth
    );
  }
  if (isRecord(raw.leaderHealth)) {
    out.leaderHealth = decodeHealthRule(
      raw.leaderHealth,
      BUILT_IN_READINESS_RULE.leaderHealth
    );
  }
  return out;
}

// Decode a stored per-TYPE rule jsonb into a PerTypeReadinessRule (#410 / ADR
// 0021). The per-type tier is structurally identical to a per-cell override — a
// partial of the global rule where only PRESENT pillars override and absent ones
// inherit — so it shares decodeCellOverride's trust-boundary shaping; this alias
// names the cascade tier at the read seam.
export function decodePerTypeRule(raw: unknown): PerTypeReadinessRule {
  return decodeCellOverride(raw);
}
