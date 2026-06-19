import { describe, expect, it } from "vitest";
import {
  buildProspectBoard,
  type ProspectBoardEntry,
} from "@/lib/supabase/prospect-reads";

// Board partitioning (#375, extended by the admin-UX archive cleanup): active
// columns vs the collapsed Joined roll-up, plus the cleanup-archive rule. A
// Prospect archived for cleanup (archived but NOT joined) must leave the board
// ENTIRELY — it is not an active card and it is not a "joined" outcome, so it
// must not be dumped into the Joined roll-up.

function prospect(over: Partial<ProspectBoardEntry>): ProspectBoardEntry {
  return {
    id: "p-1",
    full_name: "Avery Bennett",
    email: null,
    phone: null,
    state: "interested",
    group_id: null,
    archived: false,
    created_at: "2026-06-01T00:00:00Z",
    next_step: null,
    additional_note: null,
    ...over,
  };
}

const colFor = (board: ReturnType<typeof buildProspectBoard>, state: string) =>
  board.columns.find((c) => c.state === state);

describe("buildProspectBoard — active columns vs roll-up vs cleanup-archive", () => {
  it("places a live interested prospect in the interested column", () => {
    const board = buildProspectBoard([prospect({ id: "live" })], {});
    expect(colFor(board, "interested")?.prospects.map((p) => p.id)).toEqual([
      "live",
    ]);
    expect(board.joined).toHaveLength(0);
  });

  it("routes a joined prospect to the Joined roll-up (not an active column)", () => {
    const board = buildProspectBoard(
      [prospect({ id: "j", state: "joined", archived: true, group_id: "g-1" })],
      { "g-1": "Tuesday Men's" }
    );
    expect(board.joined.map((j) => j.id)).toEqual(["j"]);
    expect(board.joined[0]!.groupName).toBe("Tuesday Men's");
    for (const col of board.columns) expect(col.prospects).toHaveLength(0);
  });

  it("drops a cleanup-archived (archived, non-joined) prospect entirely", () => {
    const board = buildProspectBoard(
      [prospect({ id: "gone", state: "interested", archived: true })],
      {}
    );
    // Not on any active column…
    for (const col of board.columns) expect(col.prospects).toHaveLength(0);
    // …and NOT dumped into the Joined roll-up either.
    expect(board.joined).toHaveLength(0);
  });

  it("keeps live, joined, and cleanup-archived prospects correctly separated", () => {
    const board = buildProspectBoard(
      [
        prospect({ id: "live", state: "not_at_this_time" }),
        prospect({ id: "joined", state: "joined", archived: true }),
        prospect({ id: "archived", state: "matched", archived: true }),
      ],
      {}
    );
    expect(
      colFor(board, "not_at_this_time")?.prospects.map((p) => p.id)
    ).toEqual(["live"]);
    expect(board.joined.map((j) => j.id)).toEqual(["joined"]);
    // The matched-but-archived cleanup row is nowhere on the board.
    const allActive = board.columns.flatMap((c) =>
      c.prospects.map((p) => p.id)
    );
    expect(allActive).not.toContain("archived");
    expect(board.joined.map((j) => j.id)).not.toContain("archived");
  });
});
