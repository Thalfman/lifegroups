"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PLinkButton } from "@/components/pastoral/button";
import type { ReadinessPillarKey } from "@/lib/admin/cell-readiness";
import {
  GRID_TYPES,
  type MultiplyGrid,
  type MultiplyGridCell,
  type MultiplyGridRow,
} from "@/lib/admin/multiply-grid";
import { segmentAnchorId, segmentLabel } from "@/lib/admin/multiplication";
import { MULTIPLY_TYPE_LABEL } from "@/components/admin/multiply/multiply-data";

// Presentational Multiply GRID (#403 / PRD §2.5). Rows = categories, columns = the
// three top types (Men's / Women's / Mixed). Each ACTIVE cell shows its readiness
// signal (#402) and its `have X of Y` coverage (#400); a cell where the category
// is not applied to that type renders BLANK. This folds the three per-type boards
// into one matrix. Server component, pure render. Styled as a DataTable: 12px
// sentence-case ink3 header row, 13px cells, lineSoft row separators, mono
// figures.
//
// Mobile-first (#567): a 3-column matrix can't be read on a 375px phone without
// horizontal scroll, so at base the grid renders as a stack of category cards —
// each card lists only that category's APPLIED top types, one per labelled block.
// At `md`+ the matrix table takes over, visually identical to before. Both views
// render from the same `grid`, so behavior and data are unchanged.

// Blocker labels for the compact "held back by" line under a not-ready cell.
const BLOCKER_LABEL: Record<ReadinessPillarKey, string> = {
  interest: "Interest",
  capacity: "Capacity",
  groupHealth: "Group Health",
  leaderHealth: "Leader Health",
  memberCount: "Members",
  groupTenure: "Years as a group",
  coShepherdTenure: "Co-Leader tenure",
};

// Shared cell chrome: lineSoft separators between rows and columns.
const CELL = "border-b border-r border-lineSoft px-3.5 py-3 align-top";

// A row is "active" when at least one of its top-type cells is applied (and has
// a readout). The "Show only active cells" filter (#647) hides rows with none.
function rowHasActiveCell(row: MultiplyGridRow): boolean {
  return GRID_TYPES.some(
    (type) => row.cells[type].applied && row.cells[type].readout != null
  );
}

// Default the filter to active-only when there are enough empty rows that the
// full grid reads as dense — but never when no row is active (that would hide
// everything; the operator should see their categories instead).
const MANY_EMPTY_ROWS = 3;

function ReadinessBadge({ ready }: { ready: boolean }) {
  return (
    <Badge tone={ready ? "sage" : "neutral"}>
      {ready ? "Ready" : "Not ready"}
    </Badge>
  );
}

// The inner content of an applied cell: readiness badge, `have X of Y` coverage,
// the held-back-by line when not ready, and the deep-link into the Plan tab for
// this cell's segment. Shared by the desktop table cell and the mobile card so
// both read identically.
function GridCellContent({
  cell,
  categoryLabel,
}: {
  cell: MultiplyGridCell;
  categoryLabel: string;
}) {
  const typeLabel = MULTIPLY_TYPE_LABEL[cell.audienceCategory];
  if (!cell.applied || !cell.readout) return null;
  const { signal, coverage } = cell.readout;
  const blockers = signal.blockers.map((b) => BLOCKER_LABEL[b]).join(", ");
  // Same key the planner buckets candidates by, so the anchor lands on this
  // cell's segment in the Plan tab when one exists.
  const planHref = `/admin/multiply?tab=plan#${segmentAnchorId(
    segmentLabel(cell.audienceCategory, categoryLabel)
  )}`;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <ReadinessBadge ready={signal.ready} />
      <span
        className="font-mono text-xs text-ink2"
        aria-label={`have ${coverage.have} of ${coverage.target}`}
      >
        have {coverage.have} of {coverage.target}
      </span>
      {!signal.ready && signal.blockers.length > 0 && (
        <span className="font-sans text-xs text-ink3">
          Held back by: {blockers}.
        </span>
      )}
      <Link
        href={planHref}
        aria-label={`View the plan for ${typeLabel} · ${categoryLabel}`}
        className="font-sans text-xs text-clay underline hover:text-clayDeep"
      >
        View plan →
      </Link>
    </div>
  );
}

// One desktop table cell. A not-applied cell renders BLANK (an empty, muted
// cell); an applied cell shows the shared content above.
function GridCell({
  cell,
  categoryLabel,
}: {
  cell: MultiplyGridCell;
  categoryLabel: string;
}) {
  const typeLabel = MULTIPLY_TYPE_LABEL[cell.audienceCategory];

  if (!cell.applied || !cell.readout) {
    return (
      <td
        className={`${CELL} bg-bg text-left`}
        aria-label={`${typeLabel}: not applied`}
      >
        <span className="font-sans text-sm text-ink3">—</span>
      </td>
    );
  }

  return (
    <td className={`${CELL} text-left`}>
      <GridCellContent cell={cell} categoryLabel={categoryLabel} />
    </td>
  );
}

// One category as a stacked card (mobile). Lists only the APPLIED top types so
// the card stays readable at 375px; a category with no applied types still
// renders, naming that nothing is applied yet (mirrors the blank desktop row).
function GridCategoryCard({ row }: { row: MultiplyGridRow }) {
  const applied = GRID_TYPES.map((type) => row.cells[type]).filter(
    (cell) => cell.applied && cell.readout
  );
  return (
    <li className="grid gap-3 rounded-md border border-line bg-surface p-3.5">
      <h3 className="m-0 font-sans text-sm font-semibold text-ink">
        {row.label}
      </h3>
      {applied.length === 0 ? (
        <p className="m-0 font-sans text-xs text-ink3">
          Not applied to any top type yet.
        </p>
      ) : (
        <div className="grid gap-3">
          {applied.map((cell) => (
            <div
              key={cell.audienceCategory}
              className="grid gap-1.5 border-t border-lineSoft pt-3 first:border-t-0 first:pt-0"
            >
              <span className="font-sans text-xs font-semibold text-ink3">
                {MULTIPLY_TYPE_LABEL[cell.audienceCategory]}
              </span>
              <GridCellContent cell={cell} categoryLabel={row.label} />
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

export function MultiplyGridView({
  grid,
  ministryYear,
}: {
  grid: MultiplyGrid;
  ministryYear: number;
}) {
  const activeRows = grid.rows.filter(rowHasActiveCell);
  const emptyRowCount = grid.rows.length - activeRows.length;
  // Offer the filter only when it would actually hide something AND there's at
  // least one active row to keep on screen.
  const canFilter = emptyRowCount > 0 && activeRows.length > 0;
  // Hook must run on every render (before any early return) to satisfy
  // rules-of-hooks.
  const [showOnlyActive, setShowOnlyActive] = useState(
    canFilter && emptyRowCount >= MANY_EMPTY_ROWS
  );
  const visibleRows = canFilter && showOnlyActive ? activeRows : grid.rows;

  if (grid.rows.length === 0) {
    return (
      <div className="grid justify-items-start gap-3.5">
        <p className="m-0 font-sans text-base text-ink2">
          No categories yet. Add categories and apply them to top types in
          Settings &rsaquo; Groups, then each active cell appears here with its
          readiness and coverage.
        </p>
        <PLinkButton href="/admin/settings?tab=groups" tone="terra" size="md">
          Set up group types in Settings →
        </PLinkButton>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="m-0 font-sans text-sm text-ink2">
        Ministry year {ministryYear}–{ministryYear + 1}. Rows are categories,
        columns are the three top types. Each active cell shows whether it is
        ready to multiply (the configurable per-cell rule) and its{" "}
        <code className="font-mono">have X of Y</code> coverage. A cell where
        the category isn&rsquo;t applied to that type is left blank.
      </p>
      {/* This grid is read-only; the setup controls live in Settings. Link
          straight to the right tabs so admins don't have to guess routes. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <PLinkButton href="/admin/settings?tab=groups" tone="ghost" size="sm">
          Edit group types →
        </PLinkButton>
        <PLinkButton href="/admin/settings?tab=multiply" tone="ghost" size="sm">
          Edit multiplication trigger →
        </PLinkButton>
        {/* #647: a filter (not a redesign) — hide the category rows that have no
            active cells so a ministry with many empty categories isn't a wall of
            blanks. The full matrix stays one toggle away. */}
        {canFilter ? (
          <label className="ml-auto inline-flex items-center gap-2 font-sans text-sm text-ink2">
            <input
              type="checkbox"
              checked={showOnlyActive}
              onChange={(e) => setShowOnlyActive(e.target.checked)}
            />
            Show only active cells
            <span className="text-ink3">({emptyRowCount} hidden)</span>
          </label>
        ) : null}
      </div>

      {/* Mobile: a stack of category cards (only applied types listed), so the
          grid is readable at 375px without horizontal scroll. Hidden at md+. */}
      <ul className="m-0 grid list-none gap-3 p-0 md:hidden">
        {visibleRows.map((row) => (
          <GridCategoryCard key={row.categoryId} row={row} />
        ))}
      </ul>

      {/* Desktop (md+): the matrix table, visually identical to before. */}
      <div className="hidden overflow-x-auto rounded-md border border-line bg-surface md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th
                scope="col"
                className="min-w-40 border-b border-line bg-surfaceAlt px-3.5 py-3 text-left font-sans text-xs font-semibold text-ink3"
              >
                Category
              </th>
              {GRID_TYPES.map((type) => (
                <th
                  key={type}
                  scope="col"
                  // Left-aligned to sit over the left-aligned, multi-line cell
                  // content below (badge → coverage → blockers → plan link).
                  className="border-b border-line bg-surfaceAlt px-3.5 py-3 text-left font-sans text-xs font-semibold text-ink3"
                >
                  {MULTIPLY_TYPE_LABEL[type]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.categoryId}>
                <th
                  scope="row"
                  className={`${CELL} bg-bg text-left font-sans text-sm font-semibold text-ink`}
                >
                  {row.label}
                </th>
                {GRID_TYPES.map((type) => (
                  <GridCell
                    key={type}
                    cell={row.cells[type]}
                    categoryLabel={row.label}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
