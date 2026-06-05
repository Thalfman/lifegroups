import { describe, expect, it } from "vitest";

import {
  effectiveGradeLetter,
  tallyHealthGrades,
} from "@/lib/supabase/multiplication-config-reads";
import type { Rubric } from "@/lib/admin/health-rubric";
import type { GroupAudienceCategory, GroupHealthLetter } from "@/types/enums";

// Group/Leader Health rollup for the Multiply boards (#377/#378 → #380).
//   - effectiveGradeLetter: recompute from stored scores against the CURRENT
//     rubric (so the board agrees with the grade editor after a rubric edit),
//     then apply override expiry.
//   - tallyHealthGrades: bucket resolved grades by type, fanning a multi-type
//     leader into every type they lead.

const SEP = "2025-09-01";
const OCT = "2025-10-01";

// A one-criterion rubric: the score IS the numeric, banded 90/80/70/60.
const RUBRIC: Rubric = { criteria: [{ key: "c1", label: "C1", weight: 100 }] };

const noOverride = {
  override_letter: null,
  override_scope: null,
  override_period_month: null,
} as const;

describe("effectiveGradeLetter — recompute from scores", () => {
  it("bands the live score against the current rubric", () => {
    expect(effectiveGradeLetter(RUBRIC, { c1: 95 }, noOverride, SEP)).toBe("A");
    expect(effectiveGradeLetter(RUBRIC, { c1: 72 }, noOverride, SEP)).toBe("C");
    expect(effectiveGradeLetter(RUBRIC, { c1: 40 }, noOverride, SEP)).toBe("F");
  });

  it("returns null when nothing is scored and no override is active", () => {
    expect(effectiveGradeLetter(RUBRIC, {}, noOverride, SEP)).toBeNull();
  });

  it("ignores scores for criteria no longer in the rubric", () => {
    // A grade saved against an old criterion 'gone' now reads as unscored.
    expect(effectiveGradeLetter(RUBRIC, { gone: 95 }, noOverride, SEP)).toBeNull();
  });
});

describe("effectiveGradeLetter — override expiry", () => {
  it("an until_cleared override stands over the computed letter", () => {
    expect(
      effectiveGradeLetter(
        RUBRIC,
        { c1: 95 },
        {
          override_letter: "F",
          override_scope: "until_cleared",
          override_period_month: SEP,
        },
        OCT
      )
    ).toBe("F");
  });

  it("an expired this_month override falls back to the computed letter", () => {
    expect(
      effectiveGradeLetter(
        RUBRIC,
        { c1: 95 },
        {
          override_letter: "F",
          override_scope: "this_month",
          override_period_month: SEP,
        },
        OCT
      )
    ).toBe("A");
  });

  it("a live this_month override wins for its month", () => {
    expect(
      effectiveGradeLetter(
        RUBRIC,
        { c1: 95 },
        {
          override_letter: "F",
          override_scope: "this_month",
          override_period_month: SEP,
        },
        SEP
      )
    ).toBe("F");
  });
});

function leader(
  types: GroupAudienceCategory[],
  letter: GroupHealthLetter | null
) {
  return { types: new Set(types), letter };
}

describe("tallyHealthGrades — bucketing", () => {
  it("buckets group grades by type, dropping closed + ungraded rows", () => {
    const out = tallyHealthGrades(
      [
        { type: "men", isClosed: false, letter: "A" },
        { type: "men", isClosed: false, letter: "C" },
        { type: "men", isClosed: true, letter: "A" }, // closed → dropped
        { type: "men", isClosed: false, letter: null }, // ungraded → dropped
        { type: null, isClosed: false, letter: "B" }, // no type → dropped
        { type: "women", isClosed: false, letter: "B" },
      ],
      []
    );
    expect(out.men.groupGrades).toEqual(["A", "C"]);
    expect(out.women.groupGrades).toEqual(["B"]);
    expect(out.mixed.groupGrades).toEqual([]);
  });

  it("fans a multi-type leader into every type they lead", () => {
    const out = tallyHealthGrades(
      [],
      [leader(["men", "mixed"], "B"), leader(["women"], "A")]
    );
    expect(out.men.leaderGrades).toEqual(["B"]);
    expect(out.mixed.leaderGrades).toEqual(["B"]);
    expect(out.women.leaderGrades).toEqual(["A"]);
  });

  it("drops a leader with no type or no letter", () => {
    const out = tallyHealthGrades(
      [],
      [leader([], "A"), leader(["men"], null)]
    );
    expect(out.men.leaderGrades).toEqual([]);
    expect(out.women.leaderGrades).toEqual([]);
    expect(out.mixed.leaderGrades).toEqual([]);
  });
});
