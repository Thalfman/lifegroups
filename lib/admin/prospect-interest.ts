import type { GroupAudienceCategory } from "@/types/enums";
import { cellKey } from "@/lib/admin/cell-coordinate";

// Per-cell Interest tally — the pure core of the #399 rewrite (ADR 0016).
//
// Interest is no longer the old "joined group's type" funnel volume. It is a real
// per-cell HEADCOUNT: the number of prospects who, at intake, said they want a
// given (top type × category) CELL and are still actively interested. A cell's
// interest counts ONLY prospects in state `interested` whose archived flag is
// false — a matched, joined, not_at_this_time, or archived prospect has moved on
// from raw interest and must NOT inflate the cell. A prospect who named no
// desired cell (either coordinate null) contributes to no cell.
//
// This module is pure (no I/O): the read layer hands it bare prospect rows and it
// returns a keyed map, so the state-filtering + keying rules are isolation-tested.

// The minimal prospect shape the tally needs. Mirrors the read-model's
// ProspectBoardEntry fields without importing the whole read type, so the tally
// stays a plain-object pure function the tests can call with bare rows.
export type InterestProspectRow = {
  state: string;
  archived: boolean;
  desired_audience_category: GroupAudienceCategory | null;
  desired_category_id: string | null;
};

// A desired cell's interest key — the canonical Cell coordinate key (cellKey),
// so the tally is a flat Record consumers index directly and the keying agrees
// with every other per-cell map. The same composer reads a count back out.
export function cellInterestKey(
  audienceCategory: GroupAudienceCategory,
  categoryId: string
): string {
  return cellKey({ audience: audienceCategory, categoryId });
}

// A per-cell interest count map, keyed by cellInterestKey. A cell with no
// interested prospects is simply absent (lookups default to 0 — see
// interestForCell).
export type CellInterestTally = Record<string, number>;

// Tally interest per cell over a set of prospect rows. Counts a row toward its
// desired cell ONLY when:
//   * state === 'interested' (matched / joined / not_at_this_time excluded), AND
//   * archived === false (an archived prospect never counts), AND
//   * BOTH desired coordinates are present (a half-named cell is not a real cell).
// All other rows are skipped. The result is keyed by cellInterestKey.
export function tallyCellInterest(
  rows: readonly InterestProspectRow[]
): CellInterestTally {
  const out: CellInterestTally = {};
  for (const row of rows) {
    if (row.state !== "interested") continue;
    if (row.archived) continue;
    const audience = row.desired_audience_category;
    const category = row.desired_category_id;
    if (audience == null || category == null) continue;
    const key = cellInterestKey(audience, category);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

// Read one cell's interest count out of a tally, defaulting an absent cell to 0.
export function interestForCell(
  tally: CellInterestTally,
  audienceCategory: GroupAudienceCategory,
  categoryId: string
): number {
  return tally[cellInterestKey(audienceCategory, categoryId)] ?? 0;
}
