import type { GroupAudienceCategory } from "@/types/enums";

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

// The canonical key for a desired cell: "<audience_category>:<category_id>". A
// single string key makes the tally a flat Record the consumers can look a cell
// up in directly. The same composer is used to read a count back out, so the
// keying lives in one place.
export function cellInterestKey(
  audienceCategory: GroupAudienceCategory,
  categoryId: string
): string {
  return `${audienceCategory}:${categoryId}`;
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

// Per-TOP-TYPE interest volume, summed over that type's cells. The Multiply
// boards are per top type (men/women/mixed) and each board's Interest pillar
// takes a single volume number; this rolls the per-cell tally up to that number
// by counting interested, non-archived prospects whose DESIRED top type is each
// type (regardless of which category within it). This REPLACES the old
// "joined/matched group's type" funnel volume (tallyFunnelVolume): interest is
// now the count of people who SAID they want a group of that type and are still
// interested, not the count attached to a group of that type.
export type InterestVolumeByType = Record<GroupAudienceCategory, number>;

export const EMPTY_INTEREST_VOLUME: InterestVolumeByType = {
  men: 0,
  women: 0,
  mixed: 0,
};

export function tallyInterestVolumeByType(
  rows: readonly InterestProspectRow[]
): InterestVolumeByType {
  const out: InterestVolumeByType = { men: 0, women: 0, mixed: 0 };
  for (const row of rows) {
    if (row.state !== "interested") continue;
    if (row.archived) continue;
    const audience = row.desired_audience_category;
    const category = row.desired_category_id;
    // A real desired cell needs BOTH coordinates (mirrors tallyCellInterest), so
    // a half-named prospect feeds no type — keeping the per-type roll-up exactly
    // the sum of the per-cell tally.
    if (audience == null || category == null) continue;
    if (audience !== "men" && audience !== "women" && audience !== "mixed")
      continue;
    out[audience] += 1;
  }
  return out;
}
