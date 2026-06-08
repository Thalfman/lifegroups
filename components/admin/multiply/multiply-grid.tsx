import Link from "next/link";
import { P, fontDisplay, fontBody, fontMono } from "@/lib/pastoral";
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
// into one matrix. Server component, pure render.

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

function ReadinessBadge({ ready }: { ready: boolean }) {
  return (
    <span
      style={{
        fontFamily: fontBody,
        fontSize: 12,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 999,
        background: ready ? P.sageSoft : P.bgDeep,
        color: ready ? P.sageTextStrong : P.ink2,
        border: `1px solid ${ready ? P.sage : P.line}`,
        whiteSpace: "nowrap",
      }}
    >
      {ready ? "Ready" : "Not ready"}
    </span>
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
        style={{ ...cellStyle, background: P.bg }}
        aria-label={`${typeLabel}: not applied`}
      >
        <span style={{ color: P.ink3, fontFamily: fontBody, fontSize: 13 }}>
          —
        </span>
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
    <td style={cellStyle}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "flex-start",
        }}
      >
        <ReadinessBadge ready={signal.ready} />
        <span
          style={{ fontFamily: fontMono, fontSize: 12, color: P.ink2 }}
          aria-label={`have ${coverage.have} of ${coverage.target}`}
        >
          have {coverage.have} of {coverage.target}
        </span>
        {!signal.ready && signal.blockers.length > 0 && (
          <span style={{ fontFamily: fontBody, fontSize: 11, color: P.ink3 }}>
            Held back by: {blockers}.
          </span>
        )}
        <Link
          href={planHref}
          aria-label={`View the plan for ${typeLabel} · ${categoryLabel}`}
          style={{
            fontFamily: fontBody,
            fontSize: 11,
            color: P.terra,
            textDecoration: "underline",
          }}
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
      <div style={{ display: "grid", gap: 14, justifyItems: "start" }}>
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 14,
            color: P.ink2,
          }}
        >
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
    <div style={{ display: "grid", gap: 16 }}>
      <p
        style={{ margin: 0, fontFamily: fontBody, fontSize: 13, color: P.ink2 }}
      >
        Ministry year {ministryYear}–{ministryYear + 1}. Rows are categories,
        columns are the three top types. Each active cell shows whether it is
        ready to multiply (the configurable per-cell rule) and its{" "}
        <code style={{ fontFamily: fontMono }}>have X of Y</code> coverage. A
        cell where the category isn&rsquo;t applied to that type is left blank.
      </p>
      {/* This grid is read-only; the setup controls live in Settings. Link
          straight to the right tabs so admins don't have to guess routes. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <PLinkButton href="/admin/settings?tab=groups" tone="ghost" size="sm">
          Edit group types →
        </PLinkButton>
        <PLinkButton href="/admin/settings?tab=multiply" tone="ghost" size="sm">
          Edit multiplication trigger →
        </PLinkButton>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th
                scope="col"
                style={{ ...headStyle, textAlign: "left", minWidth: 160 }}
              >
                Category
              </th>
              {GRID_TYPES.map((type) => (
                <th key={type} scope="col" style={headStyle}>
                  {TYPE_LABEL[type]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.categoryId}>
                <th scope="row" style={rowHeadStyle}>
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

const tableStyle = {
  borderCollapse: "collapse" as const,
  width: "100%",
  background: P.surface,
  border: `1px solid ${P.line}`,
  borderRadius: 12,
  overflow: "hidden",
} as const;

const headStyle = {
  fontFamily: fontDisplay,
  fontSize: 14,
  color: P.ink,
  textAlign: "center" as const,
  padding: "12px 14px",
  background: P.bgDeep,
  borderBottom: `1px solid ${P.line}`,
} as const;

const rowHeadStyle = {
  fontFamily: fontBody,
  fontSize: 14,
  fontWeight: 600,
  color: P.ink,
  textAlign: "left" as const,
  padding: "12px 14px",
  background: P.bg,
  borderBottom: `1px solid ${P.line2}`,
  borderRight: `1px solid ${P.line2}`,
  verticalAlign: "top" as const,
} as const;

const cellStyle = {
  padding: "12px 14px",
  borderBottom: `1px solid ${P.line2}`,
  borderRight: `1px solid ${P.line2}`,
  verticalAlign: "top" as const,
  textAlign: "left" as const,
} as const;
