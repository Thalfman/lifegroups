import type { GroupAudienceCategory } from "@/types/enums";
import { AUDIENCE_CATEGORIES } from "@/lib/admin/audience";
import type { CellCoverage } from "@/lib/admin/cell-coverage";

// Settings › Groups create-flow + list helpers (#412 / ADR 0021). Pure functions
// so the shared-catalog resolution and the list order are unit-testable with no
// React and no database (ADR 0015) — the editor component is the only stateful
// shell over them.

// Normalize a catalog label the way the DB's live-unique index does
// (lower(btrim(label))), so the client resolves a typed label to the same shared
// category the SECURITY DEFINER gate would.
export function normalizeCategoryLabel(label: string): string {
  return label.trim().toLowerCase();
}

export type CategoryResolution =
  | { kind: "existing"; categoryId: string }
  | { kind: "new" };

// Resolve a typed free-text label against the LIVE catalog. A label that matches
// a live category (case-insensitively, trimmed) reuses that ONE shared category —
// so the same label typed under a second Audience resolves to a single category
// (a later rename then syncs across both cells), with no migration. An unmatched
// (or blank) label is new and must be created first. The DB stays authoritative:
// a create that races another still rejects the duplicate label.
export function resolveCategoryForLabel(
  categories: { id: string; label: string }[],
  rawLabel: string
): CategoryResolution {
  const norm = normalizeCategoryLabel(rawLabel);
  if (norm.length === 0) return { kind: "new" };
  const match = categories.find(
    (c) => normalizeCategoryLabel(c.label) === norm
  );
  return match ? { kind: "existing", categoryId: match.id } : { kind: "new" };
}

// Audience display order (Men's, Women's, Mixed) — the canonical board order.
const AUDIENCE_ORDER: Record<GroupAudienceCategory, number> = {
  men: AUDIENCE_CATEGORIES.indexOf("men"),
  women: AUDIENCE_CATEGORIES.indexOf("women"),
  mixed: AUDIENCE_CATEGORIES.indexOf("mixed"),
};

// Order the group-type list for display: by category label, then by Audience, so
// the rows that share a category (the same label under two Audiences) sit
// adjacent — making the "rename syncs across both" behaviour legible — and the
// order stays stable regardless of any shortfall sort applied upstream.
export function sortGroupTypeRows<
  T extends { label: string; audienceCategory: GroupAudienceCategory },
>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      a.label.localeCompare(b.label) ||
      AUDIENCE_ORDER[a.audienceCategory] - AUDIENCE_ORDER[b.audienceCategory]
  );
}

// One Audience board: the audience plus its active cells (sorted by label) and
// the summed coverage across them. The Settings › Groups list folds the flat
// per-cell rows into these three boards (Men's, Women's, Mixed) so a category
// shared across audiences no longer renders as N separate top-level rows.
export type AudienceBoard = {
  audienceCategory: GroupAudienceCategory;
  cells: CellCoverage[];
  haveTotal: number;
  targetTotal: number;
};

// Group the flat cell list into exactly the three Audience boards, in the
// canonical AUDIENCE_CATEGORIES order — always all three, even when a board has
// no active cells (so the UI never synthesizes the empty boards itself). Each
// board's cells reuse sortGroupTypeRows' order (label, then audience), and its
// totals sum the cells' have / target. Pure (ADR 0015): no React, no database.
export function groupCellsByAudience(
  cells: readonly CellCoverage[]
): AudienceBoard[] {
  const byAudience = new Map<GroupAudienceCategory, CellCoverage[]>();
  for (const cell of cells) {
    const bucket = byAudience.get(cell.audienceCategory);
    if (bucket) bucket.push(cell);
    else byAudience.set(cell.audienceCategory, [cell]);
  }
  return AUDIENCE_CATEGORIES.map((audienceCategory) => {
    const boardCells = sortGroupTypeRows(
      byAudience.get(audienceCategory) ?? []
    );
    return {
      audienceCategory,
      cells: boardCells,
      haveTotal: boardCells.reduce((sum, c) => sum + c.have, 0),
      targetTotal: boardCells.reduce((sum, c) => sum + c.target, 0),
    };
  });
}
