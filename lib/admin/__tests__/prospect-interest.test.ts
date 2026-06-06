import { describe, expect, it } from "vitest";

import { validateCreateProspectPayload } from "@/lib/admin/validation/prospects";
import {
  cellInterestKey,
  interestForCell,
  tallyCellInterest,
  tallyInterestVolumeByType,
  type InterestProspectRow,
} from "@/lib/admin/prospect-interest";

// #399: capture the desired cell at intake + tally interest per cell. Covers the
// validator (the create form's new top type + category fields) and the pure
// per-cell tally (state filtering: only interested counts).

// ---------------------------------------------------------------------------
// Validator — the create payload's desired (top type × category) cell.
// ---------------------------------------------------------------------------

describe("validateCreateProspectPayload — desired cell (#399)", () => {
  const CAT = "11111111-1111-1111-1111-111111111111";

  it("accepts a name with no desired cell (both null)", () => {
    const result = validateCreateProspectPayload({ full_name: "Avery" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.desired_audience_category).toBeNull();
      expect(result.value.desired_category_id).toBeNull();
    }
  });

  it("captures a valid top type + category pair", () => {
    const result = validateCreateProspectPayload({
      full_name: "Avery",
      desired_audience_category: "men",
      desired_category_id: CAT,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.desired_audience_category).toBe("men");
      expect(result.value.desired_category_id).toBe(CAT);
    }
  });

  it("rejects an out-of-domain top type", () => {
    const result = validateCreateProspectPayload({
      full_name: "Avery",
      desired_audience_category: "kids",
      desired_category_id: CAT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/top type/i);
    }
  });

  it("rejects a non-uuid category id", () => {
    const result = validateCreateProspectPayload({
      full_name: "Avery",
      desired_audience_category: "men",
      desired_category_id: "not-a-uuid",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/category is invalid/i);
    }
  });

  it("rejects a half-named cell — top type without a category", () => {
    const result = validateCreateProspectPayload({
      full_name: "Avery",
      desired_audience_category: "men",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(
        /both a top type and a category/i
      );
    }
  });

  it("rejects a half-named cell — category without a top type", () => {
    const result = validateCreateProspectPayload({
      full_name: "Avery",
      desired_category_id: CAT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(
        /both a top type and a category/i
      );
    }
  });

  it("treats blank strings as no cell (both null)", () => {
    const result = validateCreateProspectPayload({
      full_name: "Avery",
      desired_audience_category: "",
      desired_category_id: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.desired_audience_category).toBeNull();
      expect(result.value.desired_category_id).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Pure per-cell interest tally — only interested-state, non-archived prospects.
// ---------------------------------------------------------------------------

const MEN_2030 = "20303030-0000-0000-0000-000000000001";
const WOMEN_2030 = "20303030-0000-0000-0000-000000000002";

function row(over: Partial<InterestProspectRow>): InterestProspectRow {
  return {
    state: "interested",
    archived: false,
    desired_audience_category: "men",
    desired_category_id: MEN_2030,
    ...over,
  };
}

describe("cellInterestKey", () => {
  it("composes <audience>:<categoryId>", () => {
    expect(cellInterestKey("men", MEN_2030)).toBe(`men:${MEN_2030}`);
  });
});

describe("tallyCellInterest — per-cell headcount", () => {
  it("counts an interested prospect on its desired cell (acceptance: '20-30s Men' = 1)", () => {
    const tally = tallyCellInterest([row({})]);
    expect(interestForCell(tally, "men", MEN_2030)).toBe(1);
  });

  it("sums multiple interested prospects on the same cell", () => {
    const tally = tallyCellInterest([row({}), row({}), row({})]);
    expect(interestForCell(tally, "men", MEN_2030)).toBe(3);
  });

  it("keys distinct cells separately by (top type, category)", () => {
    const tally = tallyCellInterest([
      row({}),
      row({
        desired_audience_category: "women",
        desired_category_id: WOMEN_2030,
      }),
    ]);
    expect(interestForCell(tally, "men", MEN_2030)).toBe(1);
    expect(interestForCell(tally, "women", WOMEN_2030)).toBe(1);
  });

  it("does NOT count matched prospects", () => {
    const tally = tallyCellInterest([row({ state: "matched" })]);
    expect(interestForCell(tally, "men", MEN_2030)).toBe(0);
  });

  it("does NOT count joined prospects", () => {
    // joined is always archived too, but assert the state filter independently.
    const tally = tallyCellInterest([row({ state: "joined", archived: true })]);
    expect(interestForCell(tally, "men", MEN_2030)).toBe(0);
  });

  it("does NOT count not_at_this_time prospects", () => {
    const tally = tallyCellInterest([row({ state: "not_at_this_time" })]);
    expect(interestForCell(tally, "men", MEN_2030)).toBe(0);
  });

  it("does NOT count archived prospects even if state is interested", () => {
    const tally = tallyCellInterest([row({ archived: true })]);
    expect(interestForCell(tally, "men", MEN_2030)).toBe(0);
  });

  it("ignores prospects with a half-named or absent desired cell", () => {
    const tally = tallyCellInterest([
      row({ desired_category_id: null }),
      row({ desired_audience_category: null }),
      row({ desired_audience_category: null, desired_category_id: null }),
    ]);
    expect(Object.keys(tally)).toHaveLength(0);
  });

  it("filters a mixed batch to only interested, non-archived, fully-cell rows", () => {
    const tally = tallyCellInterest([
      row({}), // counts
      row({}), // counts
      row({ state: "matched" }), // excluded
      row({ state: "joined", archived: true }), // excluded
      row({ state: "not_at_this_time" }), // excluded
      row({ archived: true }), // excluded
      row({ desired_category_id: null }), // excluded
    ]);
    expect(interestForCell(tally, "men", MEN_2030)).toBe(2);
  });
});

describe("tallyInterestVolumeByType — per-type roll-up for the Multiply boards", () => {
  it("rolls cells up to their top type", () => {
    const volume = tallyInterestVolumeByType([
      row({}),
      row({ desired_category_id: "20303030-0000-0000-0000-0000000000aa" }),
      row({
        desired_audience_category: "women",
        desired_category_id: WOMEN_2030,
      }),
    ]);
    expect(volume).toEqual({ men: 2, women: 1, mixed: 0 });
  });

  it("only interested, non-archived prospects contribute to a type", () => {
    const volume = tallyInterestVolumeByType([
      row({}), // men +1
      row({ state: "matched" }), // excluded
      row({ state: "joined", archived: true }), // excluded
      row({ state: "not_at_this_time" }), // excluded
      row({ archived: true }), // excluded
      row({ desired_audience_category: null, desired_category_id: null }), // excluded
    ]);
    expect(volume).toEqual({ men: 1, women: 0, mixed: 0 });
  });

  it("equals the sum of the per-cell tally over a type's cells", () => {
    const rows = [
      row({}),
      row({}),
      row({ desired_category_id: "20303030-0000-0000-0000-0000000000aa" }),
    ];
    const cellTally = tallyCellInterest(rows);
    const volume = tallyInterestVolumeByType(rows);
    const menSum = Object.entries(cellTally)
      .filter(([k]) => k.startsWith("men:"))
      .reduce((sum, [, n]) => sum + n, 0);
    expect(volume.men).toBe(menSum);
  });
});
