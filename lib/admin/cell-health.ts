// Per-cell Health — the pure home of the Multiply grid's Group Health and Leader
// Health pillars (#403 / ADR 0019). No I/O, no Supabase.
//
// "Cell Health" (CONTEXT.md) is a single A–F roll-up, per Cell, of that cell's
// group and leader grades over the Ministry Year. It was previously assembled
// across three files: a reads module bucketed grades by cell, the per-TYPE board
// module owned the A–F averaging, and a component data loader joined the two. This
// module owns the whole concept end to end:
//
//   1. bucket — `tallyCellHealthGrades` groups already-resolved grade letters
//      under their Cell coordinate key (cellKey), dropping closed groups, ungraded
//      rows, and uncategorised rows. A leader feeds every cell they actively lead.
//   2. roll up — `resolveCellHealth` reads one cell's bucketed arrays and bands
//      each to a letter via `rollUpGrades` (lib/admin/health-rubric.ts) — the same
//      averaging the per-type board uses, so a body of grades grades identically
//      wherever it is rolled up.
//
// The read layer (lib/supabase/multiplication-config-reads.ts) does the Supabase
// read + grade resolution and hands the bucketer bare rows; the grid loader reads
// each cell's letters through `resolveCellHealth`. Both the bucketing rules and
// the roll-up are isolation-tested with plain objects here, never a live client.

import { isAudienceCategory } from "@/lib/admin/audience";
import { cellKey } from "@/lib/admin/cell-coordinate";
import { rollUpGrades } from "@/lib/admin/health-rubric";
import type { GroupAudienceCategory, GroupHealthLetter } from "@/types/enums";

// A group grade already resolved to its effective letter, ready for per-cell
// bucketing. `type`/`categoryId` name the group's cell; a closed, ungraded, or
// uncategorised group contributes to no cell.
export type ResolvedCellGroupGrade = {
  type: GroupAudienceCategory | null;
  categoryId: string | null;
  isClosed: boolean;
  letter: GroupHealthLetter | null;
};

// A leader grade already resolved to its effective letter, tagged with every Cell
// key (cellKey) of an active, non-closed, categorised group this leader leads —
// so a leader spanning more than one cell feeds each cell's Leader Health.
export type ResolvedCellLeaderGrade = {
  cells: ReadonlySet<string>;
  letter: GroupHealthLetter | null;
};

// The per-CELL effective A–F letter arrays feeding the two health pillars, keyed
// by the canonical Cell coordinate key (cellKey) — the same key every per-cell
// map uses. A cell with no grades is simply absent from the map.
export type CellHealthGrades = Map<
  string,
  { groupGrades: GroupHealthLetter[]; leaderGrades: GroupHealthLetter[] }
>;

export const EMPTY_CELL_HEALTH_GRADES: CellHealthGrades = new Map();

// One cell's rolled-up health letters: each null until that cell has any grade
// (rendered as "—"). The shape the grid's Group Health / Leader Health pillars
// consume per cell.
export type CellHealthLetters = {
  groupHealth: GroupHealthLetter | null;
  leaderHealth: GroupHealthLetter | null;
};

// Bucket each resolved group grade under its CELL (dropping closed groups,
// ungraded rows, and rows with no type/category) and each resolved leader grade
// under EVERY cell that leader actively leads. Pure — the read layer resolves the
// effective letters first and hands them here, so the bucketing rules are
// isolation-tested with bare rows.
export function tallyCellHealthGrades(
  groupGrades: ResolvedCellGroupGrade[],
  leaderGrades: ResolvedCellLeaderGrade[]
): CellHealthGrades {
  const out: CellHealthGrades = new Map();
  const ensure = (key: string) => {
    let entry = out.get(key);
    if (!entry) {
      entry = { groupGrades: [], leaderGrades: [] };
      out.set(key, entry);
    }
    return entry;
  };

  for (const g of groupGrades) {
    if (!g.letter || g.isClosed) continue;
    if (!isAudienceCategory(g.type) || g.categoryId == null) continue;
    ensure(
      cellKey({ audience: g.type, categoryId: g.categoryId })
    ).groupGrades.push(g.letter);
  }

  for (const l of leaderGrades) {
    if (!l.letter) continue;
    for (const key of l.cells) ensure(key).leaderGrades.push(l.letter);
  }

  return out;
}

// Roll one cell's bucketed grades up to its Group Health and Leader Health
// letters, reading the cell out of the tally by its canonical key. An absent cell
// (or an empty grade array) rolls up to null ("—"). This is the per-cell twin of
// the per-type board's health pillars — both band a body of grades through
// `rollUpGrades`, so the grid and the boards agree.
export function resolveCellHealth(
  grades: CellHealthGrades,
  key: string
): CellHealthLetters {
  const forCell = grades.get(key);
  return {
    groupHealth: rollUpGrades(forCell?.groupGrades ?? []),
    leaderHealth: rollUpGrades(forCell?.leaderGrades ?? []),
  };
}
