import { describe, expect, it } from "vitest";
import {
  cellKeyString,
  tallyCellActiveGroupSizes,
  type CellKey,
} from "@/lib/supabase/multiplication-config-reads";

// Pure-aggregator tests for the per-CELL active group sizes read (#401, hardened
// after codex review). The read itself is a thin Supabase round-trip; the bucketing
// logic lives in tallyCellActiveGroupSizes, exercised here with bare rows. A cell =
// (audience_category) × (category_id); the CONSIDERED cells are the ACTIVE
// category_type_targets cells, which are seeded so an empty active cell still
// appears. A group's size is its count of active memberships (the capacity-board
// count idiom); an uncategorized group (null category_id) is in no cell.

function group(
  id: string,
  audience: "men" | "women" | "mixed" | null,
  categoryId: string | null,
  lifecycle = "active"
) {
  return {
    id,
    audience_category: audience,
    category_id: categoryId,
    lifecycle_status: lifecycle,
  };
}

function membership(groupId: string, status = "active") {
  return { group_id: groupId, status };
}

function cell(
  audience: "men" | "women" | "mixed",
  categoryId: string
): CellKey {
  return { audience, categoryId };
}

describe("tallyCellActiveGroupSizes — bucket active group sizes by cell", () => {
  it("buckets each active group's active-member count under its (audience, category) cell", () => {
    const groups = [
      group("g1", "men", "cat-a"),
      group("g2", "men", "cat-a"),
      group("g3", "women", "cat-b"),
    ];
    const memberships = [
      membership("g1"),
      membership("g1"),
      membership("g1"), // g1 has 3 active members
      membership("g2"), // g2 has 1
      membership("g3"),
      membership("g3"), // g3 has 2
    ];

    const result = tallyCellActiveGroupSizes(groups, memberships, [
      cell("men", "cat-a"),
      cell("women", "cat-b"),
    ]);
    expect(result.byCell.get(cellKeyString("men", "cat-a"))).toEqual([3, 1]);
    expect(result.byCell.get(cellKeyString("women", "cat-b"))).toEqual([2]);
    expect(result.keys.get(cellKeyString("men", "cat-a"))).toEqual({
      audience: "men",
      categoryId: "cat-a",
    });
  });

  it("counts only ACTIVE memberships toward a group's size", () => {
    const result = tallyCellActiveGroupSizes(
      [group("g1", "men", "cat-a")],
      [
        membership("g1", "active"),
        membership("g1", "left"),
        membership("g1", "removed"),
      ],
      [cell("men", "cat-a")]
    );
    expect(result.byCell.get(cellKeyString("men", "cat-a"))).toEqual([1]);
  });

  it("gives an active group with no active members a size of 0", () => {
    const result = tallyCellActiveGroupSizes(
      [group("g1", "men", "cat-a")],
      [],
      [cell("men", "cat-a")]
    );
    expect(result.byCell.get(cellKeyString("men", "cat-a"))).toEqual([0]);
  });

  it("seeds an active cell with NO active groups so it still appears (thin availability can trip)", () => {
    // The crux of the codex P1 fix: an active cell with no active groups must not
    // vanish from the rollup — it is seeded with an empty size list.
    const result = tallyCellActiveGroupSizes([], [], [cell("men", "cat-a")]);
    expect(result.byCell.get(cellKeyString("men", "cat-a"))).toEqual([]);
    expect(result.keys.get(cellKeyString("men", "cat-a"))).toEqual({
      audience: "men",
      categoryId: "cat-a",
    });
  });

  it("keeps an active cell present but empty when its only groups are non-active", () => {
    const result = tallyCellActiveGroupSizes(
      [
        group("g1", "men", "cat-a", "closed"),
        group("g2", "men", "cat-a", "paused"),
      ],
      [membership("g1"), membership("g2")],
      [cell("men", "cat-a")]
    );
    expect(result.byCell.get(cellKeyString("men", "cat-a"))).toEqual([]);
  });

  it("drops a group with no audience category (it is in no cell)", () => {
    const result = tallyCellActiveGroupSizes(
      [group("g1", null, "cat-a")],
      [membership("g1")],
      [cell("men", "cat-a")]
    );
    expect(result.byCell.get(cellKeyString("men", "cat-a"))).toEqual([]);
  });

  it("excludes an uncategorized (null category_id) group — it is in no cell", () => {
    // The codex P2 fix: a null-category group must never synthesize a cell.
    const result = tallyCellActiveGroupSizes(
      [group("g1", "mixed", null), group("g2", "mixed", null)],
      [membership("g1"), membership("g2"), membership("g2")],
      []
    );
    expect(result.byCell.size).toBe(0);
  });

  it("drops a group whose cell is not an ACTIVE target (only active cells are considered)", () => {
    const result = tallyCellActiveGroupSizes(
      [group("g1", "men", "cat-a"), group("g2", "men", "cat-x")],
      [membership("g1"), membership("g2")],
      [cell("men", "cat-a")]
    );
    expect(result.byCell.get(cellKeyString("men", "cat-a"))).toEqual([1]);
    expect(result.byCell.has(cellKeyString("men", "cat-x"))).toBe(false);
  });
});
