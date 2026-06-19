import { describe, expect, it } from "vitest";
import {
  tallyCellMaturity,
  type CellKey,
} from "@/lib/supabase/multiplication-config-reads";
import { cellKey } from "@/lib/admin/cell-coordinate";

// Pure-aggregator tests for the per-CELL candidate maturity read (#483) — the
// inputs to the member-count / group-tenure / Co-Leader-tenure readiness pillars.
// CANDIDATE-first (mirrors the planner): each active multiplication candidate is
// credited to its OWN cell (type-first, falling back to its group's cell). Member
// count = manual headcount, else the attached group's active roster, else 0;
// tenures read the attached group (null when type-only). A cell takes the MAX of
// each across its candidates.

const TODAY = "2026-06-19";

const keyOf = (
  audience: "men" | "women" | "mixed",
  categoryId: string
): string => cellKey({ audience, categoryId });

function group(
  id: string,
  audience: "men" | "women" | "mixed" | null,
  categoryId: string | null,
  launchedOn: string | null,
  lifecycle = "active"
) {
  return {
    id,
    audience_category: audience,
    category_id: categoryId,
    lifecycle_status: lifecycle,
    launched_on: launchedOn,
  };
}

function candidate(
  groupId: string | null,
  audience: "men" | "women" | "mixed" | null,
  categoryId: string | null,
  manual: number | null = null
) {
  return {
    group_id: groupId,
    audience_category: audience,
    category_id: categoryId,
    manual_member_count: manual,
  };
}

function coLeader(
  groupId: string,
  assignedAt: string | null,
  role: string | null = "co_leader",
  status: string | null = "active"
) {
  return {
    group_id: groupId,
    assigned_at: assignedAt,
    profile: { role, status },
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

describe("tallyCellMaturity — per-cell candidate maturity", () => {
  it("takes the MAX group + Co-Leader tenure across the cell's candidates", () => {
    const result = tallyCellMaturity(
      [candidate("g1", "men", "cat-a"), candidate("g2", "men", "cat-a")],
      [
        group("g1", "men", "cat-a", "2020-01-01"), // ~6 years
        group("g2", "men", "cat-a", "2024-01-01"), // ~2 years
      ],
      [coLeader("g1", "2024-06-01")], // ~2 years
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))).toEqual({
      memberCount: 0,
      groupTenureYears: 6,
      coShepherdTenureYears: 2,
    });
  });

  it("prefers the Julian-fed manual count over the roster, maxed across candidates (ADR 0022)", () => {
    const result = tallyCellMaturity(
      [
        candidate("g1", "men", "cat-a", 14), // manual 14 (roster 2)
        candidate("g2", "men", "cat-a"), // no manual → roster 3
      ],
      [
        group("g1", "men", "cat-a", "2024-01-01"),
        group("g2", "men", "cat-a", "2024-01-01"),
      ],
      [],
      [
        membership("g1"),
        membership("g1"),
        membership("g2"),
        membership("g2"),
        membership("g2"),
      ],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))?.memberCount).toBe(14);
  });

  it("falls back to the attached group's active roster when no manual count", () => {
    const result = tallyCellMaturity(
      [candidate("g1", "men", "cat-a")],
      [group("g1", "men", "cat-a", "2024-01-01")],
      [],
      [membership("g1"), membership("g1"), membership("g1", "left")],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))?.memberCount).toBe(2);
  });

  it("credits a TYPE-ONLY candidate's manual count to its own cell (no group)", () => {
    // The crux of the type-first parity fix: a candidate with no group still
    // contributes its manual count to its own cell (matches the Plan chip).
    const result = tallyCellMaturity(
      [candidate(null, "men", "cat-a", 12)],
      [],
      [],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))).toEqual({
      memberCount: 12,
      groupTenureYears: null,
      coShepherdTenureYears: null,
    });
  });

  it("credits a candidate to its OWN cell, not its group's current cell (type-first)", () => {
    // The candidate's own cell (cat-new) wins over the attached group's cell
    // (cat-old), so cat-new gets the count/tenure and cat-old gets nothing.
    const result = tallyCellMaturity(
      [candidate("g1", "men", "cat-new", 12)],
      [group("g1", "men", "cat-old", "2020-01-01")],
      [],
      [],
      [cell("men", "cat-new"), cell("men", "cat-old")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-new"))).toEqual({
      memberCount: 12,
      groupTenureYears: 6, // the attached group's launch, credited to cat-new
      coShepherdTenureYears: null,
    });
    expect(result.byCell.get(keyOf("men", "cat-old"))).toEqual({
      memberCount: 0,
      groupTenureYears: null,
      coShepherdTenureYears: null,
    });
  });

  it("falls back to the attached group's cell for a legacy candidate with null type columns", () => {
    const result = tallyCellMaturity(
      [candidate("g1", null, null, 9)],
      [group("g1", "men", "cat-a", "2024-01-01")],
      [],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))?.memberCount).toBe(9);
  });

  it("lets a manual count of 0 override the roster (Julian's correction wins)", () => {
    const result = tallyCellMaturity(
      [candidate("g1", "men", "cat-a", 0)],
      [group("g1", "men", "cat-a", "2024-01-01")],
      [],
      [membership("g1"), membership("g1"), membership("g1")],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))?.memberCount).toBe(0);
  });

  it("seeds a cell with no candidate at 0 members / null tenures (a candidate-less group contributes nothing)", () => {
    const result = tallyCellMaturity(
      [],
      [group("g1", "men", "cat-a", "2010-01-01")],
      [coLeader("g1", "2010-01-01")],
      [membership("g1"), membership("g1")],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))).toEqual({
      memberCount: 0,
      groupTenureYears: null,
      coShepherdTenureYears: null,
    });
  });

  it("keeps group tenure null when the candidate's group has no launch date", () => {
    const result = tallyCellMaturity(
      [candidate("g1", "men", "cat-a")],
      [group("g1", "men", "cat-a", null)],
      [coLeader("g1", "2020-01-01")],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))).toEqual({
      memberCount: 0,
      groupTenureYears: null,
      coShepherdTenureYears: 6,
    });
  });

  it("reads Co-Leader tenure from the EARLIEST active co_leader of the group", () => {
    const result = tallyCellMaturity(
      [candidate("g1", "men", "cat-a")],
      [group("g1", "men", "cat-a", "2024-01-01")],
      [
        coLeader("g1", "2024-06-01"), // ~2 years
        coLeader("g1", "2025-06-01"), // ~1 year — earliest wins → 2 years
      ],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(
      result.byCell.get(keyOf("men", "cat-a"))?.coShepherdTenureYears
    ).toBe(2);
  });

  it("ignores a stale co-leader whose profile is no longer a leader (os7)", () => {
    const result = tallyCellMaturity(
      [candidate("g1", "men", "cat-a")],
      [group("g1", "men", "cat-a", "2024-01-01")],
      [
        coLeader("g1", "2018-01-01", "member"), // demoted
        coLeader("g1", "2024-06-01", "co_leader"), // the real one → 2
      ],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(
      result.byCell.get(keyOf("men", "cat-a"))?.coShepherdTenureYears
    ).toBe(2);
  });

  it("ignores a deactivated co-leader (status inactive) even with role co_leader", () => {
    const result = tallyCellMaturity(
      [candidate("g1", "men", "cat-a")],
      [group("g1", "men", "cat-a", "2024-01-01")],
      [
        coLeader("g1", "2018-01-01", "co_leader", "inactive"), // deactivated
        coLeader("g1", "2024-06-01", "co_leader", "active"), // active → 2
      ],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(
      result.byCell.get(keyOf("men", "cat-a"))?.coShepherdTenureYears
    ).toBe(2);
  });

  it("drops a candidate whose cell is not an ACTIVE target", () => {
    const result = tallyCellMaturity(
      [candidate(null, "men", "cat-x", 20)],
      [],
      [],
      [],
      [cell("men", "cat-a")],
      TODAY
    );
    expect(result.byCell.get(keyOf("men", "cat-a"))?.memberCount).toBe(0);
    expect(result.byCell.has(keyOf("men", "cat-x"))).toBe(false);
  });
});
