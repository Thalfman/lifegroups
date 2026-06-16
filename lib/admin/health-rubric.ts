// Health Rubric engine — pure computation. No I/O, no Supabase. Mirrors the
// idiom of lib/admin/group-health.ts: a tunable config (here, an operator-built
// rubric of weighted criteria) plus pure functions a caller feeds bare objects,
// so every rule is isolation-testable without a DB.
//
// Issue #374 / ADR 0018: ADR 0007 shipped Group Health with placeholder labels
// and DEFERRED the rubric because Julian was still designing how to grade a
// group. This module is the builder ADR 0018 hands him: a configurable rubric of
// weighted criteria whose weightings total 100, rolled up to an A / B / C / D / F
// letter (the F is new — the enum was A–D). A manual override can still force the
// letter, honouring the existing this-month / until-cleared override scopes
// (GroupHealthOverrideScope, reused here so a leader/group rubric share one
// vocabulary).

import type {
  GroupHealthLetter,
  GroupHealthOverrideScope,
} from "@/types/enums";

// ---------------------------------------------------------------------------
// Rubric shape: an ordered list of weighted criteria.
// ---------------------------------------------------------------------------

// One criterion of a rubric. `key` is the stable storage handle (kept across a
// rename), `label` is the operator-facing name, `weight` is its share of the
// 100-point total.
export type RubricCriterion = {
  key: string;
  label: string;
  weight: number;
};

// A rubric is just its ordered criteria. The kind (group/leader) lives on the
// stored row, not in the math — the engine grades any rubric the same way.
export type Rubric = {
  criteria: RubricCriterion[];
};

// The required weight total. Julian explicitly asked to own the weights; the
// builder rejects a save unless they total this (ADR 0018).
export const RUBRIC_WEIGHT_TOTAL = 100;

// The working in-code default the Settings editor seeds when no Group Health
// Rubric has been saved yet (#642), so the operator tunes a sensible 40/40/20
// starting point instead of staring at a zeroed "0/100" form. It mirrors the
// three dimensions and weights of BUILT_IN_GROUP_HEALTH_RUBRIC
// (lib/admin/group-health.ts) and sums to RUBRIC_WEIGHT_TOTAL. Nothing is
// persisted until the admin's first save — this only changes what the editor
// shows, never the stored rubric or the grade engine.
export const DEFAULT_GROUP_RUBRIC_CRITERIA: RubricCriterion[] = [
  { key: "attendance", label: "Attendance", weight: 40 },
  { key: "spiritual_growth", label: "Spiritual growth", weight: 40 },
  { key: "group_question", label: "Group question", weight: 20 },
];

// ---------------------------------------------------------------------------
// Score bands: internal-numeric (0–100) floors for each letter (incl. F).
// ---------------------------------------------------------------------------

// A value at or above `a` is an A; at or above `b` a B; and so on. Anything
// below `d` is an F — the band the A–D scale never had. Defaults are the
// familiar 90/80/70/60 ladder; tunable later through the same audited path.
export type RubricBands = {
  a: number;
  b: number;
  c: number;
  d: number;
};

export const BUILT_IN_RUBRIC_BANDS: RubricBands = {
  a: 90,
  b: 80,
  c: 70,
  d: 60,
};

// The full A–F letter ladder (best → worst). F is index 4; a higher index is a
// worse grade. The engine's letters are a subset of GroupHealthLetter, which
// already includes F (types/enums.ts).
export const HEALTH_GRADE_LADDER: GroupHealthLetter[] = [
  "A",
  "B",
  "C",
  "D",
  "F",
];

// Decode a stored rubric's raw jsonb `criteria` (read through the column
// allowlist as `unknown`) into a clean RubricCriterion[]. Drops any malformed
// entry rather than throwing, so a partially-corrupt row still surfaces its
// valid criteria. The single trust-boundary decode shared by the Settings read
// and any grade-time read.
export function decodeRubricCriteria(raw: unknown): RubricCriterion[] {
  if (!Array.isArray(raw)) return [];
  const out: RubricCriterion[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    if (
      typeof rec.key === "string" &&
      typeof rec.label === "string" &&
      typeof rec.weight === "number" &&
      Number.isFinite(rec.weight)
    ) {
      out.push({ key: rec.key, label: rec.label, weight: rec.weight });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// validateRubric — the weight-to-100 gate (acceptance #1 / #4).
// ---------------------------------------------------------------------------

export type RubricValidation = { ok: true } | { ok: false; errors: string[] };

// Validate a set of criteria: every criterion needs a non-empty key + label and
// a finite, non-negative weight, keys must be unique, and the weights must total
// exactly RUBRIC_WEIGHT_TOTAL. Rejecting unless the weights total 100 is the
// load-bearing rule — the Settings editor disables Save until this passes.
export function validateRubric(criteria: RubricCriterion[]): RubricValidation {
  const errors: string[] = [];

  if (!Array.isArray(criteria) || criteria.length === 0) {
    return { ok: false, errors: ["Add at least one criterion."] };
  }

  const seen = new Set<string>();
  for (const c of criteria) {
    const key = typeof c.key === "string" ? c.key.trim() : "";
    const label = typeof c.label === "string" ? c.label.trim() : "";
    if (key.length === 0) errors.push("Every criterion needs a key.");
    else if (seen.has(key)) errors.push(`Duplicate criterion key: ${key}.`);
    else seen.add(key);
    if (label.length === 0) errors.push("Every criterion needs a label.");
    if (
      typeof c.weight !== "number" ||
      !Number.isFinite(c.weight) ||
      c.weight < 0
    ) {
      errors.push(`Weight for "${label || key}" must be 0 or more.`);
    }
  }

  const total = criteria.reduce(
    (sum, c) => sum + (typeof c.weight === "number" ? c.weight : 0),
    0
  );
  if (total !== RUBRIC_WEIGHT_TOTAL) {
    errors.push(
      `Weights must total ${RUBRIC_WEIGHT_TOTAL} (currently ${total}).`
    );
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

// ---------------------------------------------------------------------------
// computeGrade — weighted roll-up → letter, with override precedence.
// ---------------------------------------------------------------------------

// Per-criterion 0–100 scores, keyed by the criterion's `key`. A criterion with
// no score for the period is omitted; its weight is dropped and the remaining
// weights renormalize over what is actually present (mirrors group-health.ts).
export type RubricScores = Record<string, number>;

// A manual override forces the letter regardless of the computed roll-up,
// honouring the existing this-month / until-cleared scopes (ADR 0018).
export type RubricOverride = {
  letter: GroupHealthLetter;
  scope: GroupHealthOverrideScope;
};

export type ComputedRubricGrade = {
  // Weighted 0–100 internal numeric over the scored criteria, or null when no
  // criterion has a score.
  numeric: number | null;
  // The effective A–F letter: the override's letter when one is supplied, else
  // the band letter for the numeric, else null.
  letter: GroupHealthLetter | null;
  // True when the letter came from a manual override (so callers can badge it).
  overridden: boolean;
};

function letterForNumeric(
  numeric: number,
  bands: RubricBands
): GroupHealthLetter {
  if (numeric >= bands.a) return "A";
  if (numeric >= bands.b) return "B";
  if (numeric >= bands.c) return "C";
  if (numeric >= bands.d) return "D";
  return "F";
}

// Roll the scored criteria up by weight into a 0–100 numeric, then band it to an
// A–F letter — UNLESS a manual override is supplied, which takes precedence and
// forces the letter (the override still reports the computed numeric alongside,
// so the underlying signal is not lost). Renormalizes over present criteria so a
// partially-scored rubric grades on what it has.
export function computeGrade(
  rubric: Rubric,
  scores: RubricScores,
  override?: RubricOverride,
  bands: RubricBands = BUILT_IN_RUBRIC_BANDS
): ComputedRubricGrade {
  const present = rubric.criteria
    .filter(
      (c) => typeof scores[c.key] === "number" && Number.isFinite(scores[c.key])
    )
    .map((c) => ({ score: scores[c.key], weight: c.weight }));

  const totalWeight = present.reduce((sum, d) => sum + d.weight, 0);
  const numeric =
    present.length === 0 || totalWeight <= 0
      ? null
      : present.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight;

  // Override precedence: a forced letter wins over the computed band.
  if (override) {
    return { numeric, letter: override.letter, overridden: true };
  }

  return {
    numeric,
    letter: numeric === null ? null : letterForNumeric(numeric, bands),
    overridden: false,
  };
}
