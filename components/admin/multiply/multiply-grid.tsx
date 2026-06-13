import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PLinkButton } from "@/components/pastoral/button";
import type { ReadinessPillarKey } from "@/lib/admin/cell-readiness";
import {
  GRID_TYPES,
  type MultiplyGrid,
  type MultiplyGridCell,
} from "@/lib/admin/multiply-grid";
import { segmentAnchorId, segmentLabel } from "@/lib/admin/multiplication";
import type { GroupAudienceCategory } from "@/types/enums";

// Presentational Multiply GRID (#403 / PRD §2.5). Rows = categories, columns = the
// three top types (Men's / Women's / Mixed). Each ACTIVE cell shows its readiness
// signal (#402) and its `have X of Y` coverage (#400); a cell where the category
// is not applied to that type renders BLANK. This folds the three per-type boards
// into one matrix. Server component, pure render. Styled as a DataTable: 12px
// sentence-case ink3 header row, 13px cells, lineSoft row separators, mono
// figures.

const TYPE_LABEL: Record<GroupAudienceCategory, string> = {
  men: "Men's",
  women: "Women's",
  mixed: "Mixed",
};

// Blocker labels for the compact "held back by" line under a not-ready cell.
const BLOCKER_LABEL: Record<ReadinessPillarKey, string> = {
  interest: "Interest",
  capacity: "Capacity",
  groupHealth: "Group Health",
  leaderHealth: "Leader Health",
};

// Shared cell chrome: lineSoft separators between rows and columns.
const CELL = "border-b border-r border-lineSoft px-3.5 py-3 align-top";

function ReadinessBadge({ ready }: { ready: boolean }) {
  return (
    <Badge tone={ready ? "sage" : "neutral"}>
      {ready ? "Ready" : "Not ready"}
    </Badge>
  );
}

// One grid cell. A not-applied cell renders BLANK (an empty, muted cell). An
// applied cell shows its readiness badge, the `have X of Y` coverage, when not
// ready a compact list of the pillars holding it back, and a deep-link into the
// Plan tab filtered to this cell's audience × category segment (#403 / ADR 0022).
function GridCell({
  cell,
  categoryLabel,
}: {
  cell: MultiplyGridCell;
  categoryLabel: string;
}) {
  const typeLabel = TYPE_LABEL[cell.audienceCategory];

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

  const { signal, coverage } = cell.readout;
  const blockers = signal.blockers.map((b) => BLOCKER_LABEL[b]).join(", ");
  // Same key the planner buckets candidates by, so the anchor lands on this
  // cell's segment in the Plan tab when one exists.
  const planHref = `/admin/multiply?tab=plan#${segmentAnchorId(
    segmentLabel(cell.audienceCategory, categoryLabel)
  )}`;

  return (
    <td className={`${CELL} text-left`}>
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
    </td>
  );
}

export function MultiplyGridView({
  grid,
  ministryYear,
}: {
  grid: MultiplyGrid;
  ministryYear: number;
}) {
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
      <div className="flex flex-wrap gap-2.5">
        <PLinkButton href="/admin/settings?tab=groups" tone="ghost" size="sm">
          Edit group types →
        </PLinkButton>
        <PLinkButton href="/admin/settings?tab=multiply" tone="ghost" size="sm">
          Edit multiplication trigger →
        </PLinkButton>
      </div>
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
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
                  {TYPE_LABEL[type]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
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
