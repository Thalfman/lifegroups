// The live Cell — the unit CONTEXT.md defines: an Audience × Category coordinate
// carrying its target, coverage, capacity, interest, health, and readiness. Pure,
// no I/O, no Supabase.
//
// This is the one home for assembling a resolved Cell. Its facets each have their
// own pure module — coverage (cell-coverage.ts), capacity (cell-capacity.ts),
// interest (prospect-interest.ts), health (cell-health.ts), and the readiness rule
// + cascade (cell-readiness.ts). `resolveCell` composes them: it reads every facet
// for a cell through ONE canonical cellKey (so a cell's signals can never be
// stitched from mismatched coordinates), resolves the three-tier readiness rule
// (global → per-type → per-cell, ADR 0021) and evaluates it, and pairs the signal
// with the cell's `have X of Y` coverage.
//
// Previously this resolution was split across two layers: input assembly lived in
// the Multiply grid's UI data loader (`buildGridCellInputs`) while readiness
// resolution lived inside the grid builder's row loop. The Cell is now resolved in
// one place; the read layer gathers the per-cell reads (lib/supabase/
// multiplication-config-reads.ts + cell-coverage) and the grid builder
// (lib/admin/multiply-grid.ts) only arranges resolved Cells into the rows × columns
// matrix. Both the per-cell wiring and the cascade are isolation-tested here.

import { cellKey, type CellCoordinate } from "@/lib/admin/cell-coordinate";
import { computeCellCapacityIssue } from "@/lib/admin/cell-capacity";
import {
  resolveCellHealth,
  type CellHealthGrades,
} from "@/lib/admin/cell-health";
import {
  decodeCellOverride,
  evaluateCellReadiness,
  resolveReadinessRule,
  type CellReadinessInputs,
  type CellReadinessSignal,
  type PerTypeReadinessRule,
  type ReadinessRule,
} from "@/lib/admin/cell-readiness";
import type { CellInterestTally } from "@/lib/admin/prospect-interest";
import type { GroupAudienceCategory } from "@/types/enums";
import type { CategoryTypeTargetRow } from "@/lib/supabase/group-categories-reads";
import type {
  CellActiveGroupSizes,
  CellMaturity,
} from "@/lib/supabase/multiplication-config-reads";

// A resolved live Cell: its coordinate, whether the category is applied to that
// type (active), its `have X of Y` coverage, the natural-unit readiness inputs
// (interest headcount, capacity issue, the two health letters), and its readiness
// signal. `signal` is null for an unapplied cell — its inputs are never evaluated
// (the grid renders it blank), but the inputs/coverage are still resolved for a
// uniform shape.
export type ResolvedCell = {
  coordinate: CellCoordinate;
  applied: boolean;
  coverage: { have: number; target: number };
  inputs: CellReadinessInputs;
  signal: CellReadinessSignal | null;
};

// The raw per-cell facet reads, each keyed by the canonical cellKey. `resolveCell`
// reads each cell's facets out of these by its one key, so every pillar lookup for
// a cell agrees on the coordinate.
export type CellFacetReads = {
  interest: CellInterestTally;
  cellSizes: CellActiveGroupSizes;
  cellHealth: CellHealthGrades;
  // #483: per-cell max group tenure + Co-Leader tenure (years), feeding the two
  // tenure pillars. Member count reads the max of `cellSizes` (no extra read).
  cellMaturity: CellMaturity;
  haveByKey: ReadonlyMap<string, number>;
};

// The readiness rule context a single cell resolves against: the global rule and
// this cell's column (per-type) rule. The cell's own override is decoded from its
// stored `triggerOverrides` inside `resolveCell`.
export type CellRuleContext = {
  globalRule: ReadinessRule;
  perTypeRule: PerTypeReadinessRule;
};

// Resolve one live Cell. Reads its interest, capacity, health, and coverage out of
// the shared facet maps by a single cellKey; resolves the three-tier readiness
// rule (global → per-type → this cell's decoded override) and evaluates it against
// the assembled inputs. An unapplied (inactive) cell is resolved but not evaluated
// — `signal` is null, so the grid renders it blank.
export function resolveCell(
  cell: {
    coordinate: CellCoordinate;
    active: boolean;
    target: number;
    triggerOverrides: unknown;
  },
  facets: CellFacetReads,
  rules: CellRuleContext
): ResolvedCell {
  // One coordinate, one encoder — every facet lookup for this cell reads the same
  // key.
  const key = cellKey(cell.coordinate);
  const sizes = facets.cellSizes.byCell.get(key) ?? [];
  const maturity = facets.cellMaturity.byCell.get(key);
  const inputs: CellReadinessInputs = {
    interestCount: facets.interest[key] ?? 0,
    capacityIssue: computeCellCapacityIssue(sizes).isIssue,
    ...resolveCellHealth(facets.cellHealth, key),
    // The three multiplication pillars come pre-aggregated (max across the cell's
    // groups) from the maturity facet: the effective member count (Julian-fed
    // manual count, else roster — ADR 0022) and the two tenures in whole years
    // (null when ungrounded). Defaults stand for a cell with no maturity entry.
    memberCount: maturity?.memberCount ?? 0,
    groupTenureYears: maturity?.groupTenureYears ?? null,
    coShepherdTenureYears: maturity?.coShepherdTenureYears ?? null,
  };
  const coverage = {
    have: facets.haveByKey.get(key) ?? 0,
    target: cell.target,
  };
  const signal = cell.active
    ? evaluateCellReadiness(
        resolveReadinessRule(
          rules.globalRule,
          rules.perTypeRule,
          decodeCellOverride(cell.triggerOverrides)
        ),
        inputs
      )
    : null;
  return {
    coordinate: cell.coordinate,
    applied: cell.active,
    coverage,
    inputs,
    signal,
  };
}

// Resolve every target cell against the global + per-type rules. The per-type tier
// is keyed by top type; a type with no rule inherits the global rule for every
// pillar (an empty override), so an unseeded column resolves straight off global.
export function resolveCells(
  targetCells: readonly CategoryTypeTargetRow[],
  facets: CellFacetReads,
  rules: {
    globalRule: ReadinessRule;
    perTypeRules: Partial<Record<GroupAudienceCategory, PerTypeReadinessRule>>;
  }
): ResolvedCell[] {
  return targetCells.map((row) =>
    resolveCell(
      {
        coordinate: {
          audience: row.audience_category,
          categoryId: row.category_id,
        },
        active: row.active,
        target: row.target_count,
        triggerOverrides: row.trigger_overrides,
      },
      facets,
      {
        globalRule: rules.globalRule,
        perTypeRule: rules.perTypeRules[row.audience_category] ?? {},
      }
    )
  );
}
