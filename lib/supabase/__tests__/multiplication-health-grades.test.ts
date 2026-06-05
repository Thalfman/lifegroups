import { describe, expect, it } from "vitest";

import { tallyHealthGrades } from "@/lib/supabase/multiplication-config-reads";
import type { GroupAudienceCategory } from "@/types/enums";

// Pure bucketing for the Multiply Group/Leader Health pillars (#377/#378 → #380).
// Proves: bucketing by type, effective-letter resolution (this-month override
// expiry vs until-cleared standing), and the exclusions (closed group, ungraded
// row, leader with no active categorised leadership).

const SEP = "2025-09-01";
const OCT = "2025-10-01";

function groupRow(
  type: GroupAudienceCategory | null,
  fields: {
    computed_letter?: "A" | "B" | "C" | "D" | "F" | null;
    override_letter?: "A" | "B" | "C" | "D" | "F" | null;
    override_scope?: "this_month" | "until_cleared" | null;
    override_period_month?: string | null;
    lifecycle_status?: string | null;
  }
) {
  return {
    computed_letter: fields.computed_letter ?? null,
    override_letter: fields.override_letter ?? null,
    override_scope: fields.override_scope ?? null,
    override_period_month: fields.override_period_month ?? null,
    group:
      type === null
        ? null
        : {
            audience_category: type,
            lifecycle_status: fields.lifecycle_status ?? "active",
          },
  };
}

function leaderRow(
  profile_id: string,
  computed_letter: "A" | "B" | "C" | "D" | "F" | null
) {
  return {
    profile_id,
    computed_letter,
    override_letter: null,
    override_scope: null,
    override_period_month: null,
  };
}

describe("tallyHealthGrades — bucketing by type", () => {
  it("buckets group + leader grades under their type", () => {
    const out = tallyHealthGrades(
      [
        groupRow("men", { computed_letter: "A" }),
        groupRow("men", { computed_letter: "C" }),
        groupRow("women", { computed_letter: "B" }),
      ],
      [leaderRow("p1", "A"), leaderRow("p2", "D")],
      new Map<string, GroupAudienceCategory>([
        ["p1", "men"],
        ["p2", "women"],
      ]),
      SEP
    );
    expect(out.men.groupGrades).toEqual(["A", "C"]);
    expect(out.women.groupGrades).toEqual(["B"]);
    expect(out.mixed.groupGrades).toEqual([]);
    expect(out.men.leaderGrades).toEqual(["A"]);
    expect(out.women.leaderGrades).toEqual(["D"]);
  });
});

describe("tallyHealthGrades — effective letter resolution", () => {
  it("an until_cleared override stands and feeds the pillar", () => {
    const out = tallyHealthGrades(
      [
        groupRow("men", {
          computed_letter: "B",
          override_letter: "F",
          override_scope: "until_cleared",
          override_period_month: SEP,
        }),
      ],
      [],
      new Map(),
      OCT
    );
    expect(out.men.groupGrades).toEqual(["F"]);
  });

  it("an expired this_month override falls back to the computed letter", () => {
    const out = tallyHealthGrades(
      [
        groupRow("men", {
          computed_letter: "B",
          override_letter: "A",
          override_scope: "this_month",
          override_period_month: SEP,
        }),
      ],
      [],
      new Map(),
      OCT
    );
    expect(out.men.groupGrades).toEqual(["B"]);
  });

  it("a live this_month override feeds the pillar", () => {
    const out = tallyHealthGrades(
      [
        groupRow("men", {
          computed_letter: "B",
          override_letter: "A",
          override_scope: "this_month",
          override_period_month: SEP,
        }),
      ],
      [],
      new Map(),
      SEP
    );
    expect(out.men.groupGrades).toEqual(["A"]);
  });
});

describe("tallyHealthGrades — exclusions", () => {
  it("drops closed groups, ungraded rows, and uncategorised groups", () => {
    const out = tallyHealthGrades(
      [
        groupRow("men", { computed_letter: "A", lifecycle_status: "closed" }),
        groupRow("men", { computed_letter: null }), // ungraded
        groupRow(null, { computed_letter: "A" }), // no group / type
        groupRow("men", { computed_letter: "B" }), // the only survivor
      ],
      [],
      new Map(),
      SEP
    );
    expect(out.men.groupGrades).toEqual(["B"]);
  });

  it("drops a leader with no active categorised leadership", () => {
    const out = tallyHealthGrades(
      [],
      [leaderRow("p1", "A"), leaderRow("orphan", "B")],
      new Map<string, GroupAudienceCategory>([["p1", "mixed"]]),
      SEP
    );
    expect(out.mixed.leaderGrades).toEqual(["A"]);
    expect(out.men.leaderGrades).toEqual([]);
    expect(out.women.leaderGrades).toEqual([]);
  });
});
