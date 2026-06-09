import { describe, expect, it } from "vitest";

import {
  EMPTY_PROSPECT_STATE_COUNTS,
  fetchProspectStateCounts,
  tallyProspectStateCounts,
} from "@/lib/supabase/prospect-reads";
import type { AppSupabaseClient } from "@/lib/supabase/types";

// The narrow Home-overview Prospect count read (#470). Deliberately NOT the
// full board read: the Interest Funnel card renders counts only, so the
// allowlist is `state, archived` and nothing else — no identity or contact
// column may cross this seam. The pure tally mirrors buildProspectBoard's
// partition rules so Home's counts can never disagree with the Plan board.

// Captures the column allowlist and the filter passed to the query builder,
// resolving to fixture rows (or an error). Mirrors the thenable query-builder
// mock used across the read-model tests (no DB).
function makeClient(rows: unknown[], error: { message: string } | null = null) {
  let selectArg = "";
  let orArg = "";
  const builder: Record<string, unknown> = {
    select: (cols: string) => {
      selectArg = cols;
      return builder;
    },
    or: (filter: string) => {
      orArg = filter;
      return builder;
    },
    range: () => builder,
    returns: () => builder,
    then: (onF: (v: unknown) => unknown, onR: (e: unknown) => unknown) =>
      Promise.resolve({ data: error ? null : rows, error }).then(onF, onR),
  };
  const client = {
    from: () => builder,
  } as unknown as AppSupabaseClient;
  return { client, select: () => selectArg, or: () => orArg };
}

describe("fetchProspectStateCounts — narrow Home count read", () => {
  it("selects ONLY state and archived — never identity or contact columns", async () => {
    const { client, select } = makeClient([]);
    await fetchProspectStateCounts(client);
    const cols = select();
    expect(cols).not.toBe("*");
    expect(
      cols
        .split(",")
        .map((c) => c.trim())
        .sort()
    ).toEqual(["archived", "state"]);
  });

  it("applies the board's filter: live rows OR joined roll-up rows", async () => {
    const { client, or } = makeClient([]);
    await fetchProspectStateCounts(client);
    // Cleanup-archived non-joined rows are excluded in the DB, before the page
    // cap, exactly as the board read does.
    expect(or()).toBe("archived.eq.false,state.eq.joined");
  });

  it("tallies the fixture rows by state", async () => {
    const { client } = makeClient([
      { state: "interested", archived: false },
      { state: "interested", archived: false },
      { state: "matched", archived: false },
      { state: "not_at_this_time", archived: false },
      { state: "joined", archived: true },
    ]);
    const result = await fetchProspectStateCounts(client);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      interested: 2,
      matched: 1,
      joined: 1,
      not_at_this_time: 1,
    });
  });

  it("returns the error — not zero counts — when the read fails", async () => {
    const { client } = makeClient([], { message: "boom" });
    const result = await fetchProspectStateCounts(client);
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain("fetchProspectStateCounts");
  });
});

describe("tallyProspectStateCounts — board-parity partition rules", () => {
  it("counts a joined row toward the roll-up even though it is archived", () => {
    expect(
      tallyProspectStateCounts([{ state: "joined", archived: true }])
    ).toEqual({ ...EMPTY_PROSPECT_STATE_COUNTS, joined: 1 });
  });

  it("drops a cleanup-archived (archived, non-joined) row entirely", () => {
    expect(
      tallyProspectStateCounts([
        { state: "matched", archived: true },
        { state: "interested", archived: false },
      ])
    ).toEqual({ ...EMPTY_PROSPECT_STATE_COUNTS, interested: 1 });
  });

  it("returns all-zero counts for no rows without mutating the shared empty", () => {
    const counts = tallyProspectStateCounts([]);
    expect(counts).toEqual(EMPTY_PROSPECT_STATE_COUNTS);
    expect(counts).not.toBe(EMPTY_PROSPECT_STATE_COUNTS);
  });
});
