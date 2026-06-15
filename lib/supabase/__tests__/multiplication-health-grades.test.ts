import { describe, expect, it } from "vitest";

import {
  cellHealthKey,
  tallyCellHealthGrades,
} from "@/lib/supabase/multiplication-config-reads";
import { resolveGroupRubricGrade } from "@/lib/admin/group-rubric-grade";
import { resolveLeaderGrade } from "@/lib/admin/leader-rubric-grade";
import { ministryYearOf } from "@/lib/admin/ministry-year";
import type { Rubric } from "@/lib/admin/health-rubric";
import type { GradeOverrideScope } from "@/lib/admin/group-health-override";
import type { GroupHealthLetter } from "@/types/enums";

// Group/Leader Health rollup for the Multiply grid (#377/#378 → #380 → #403).
//   - effective letter: the per-cell roll-up recomputes the stored scores
//     against the CURRENT rubric (so the grid agrees with the grade editor after
//     a rubric edit), then applies override expiry — now via the shared grade
//     facades (resolveGroupRubricGrade / resolveLeaderGrade) the reads layer
//     calls, after issue #636 retired the reads-layer effectiveGradeLetter.
//   - tallyCellHealthGrades: bucket resolved grades by CELL (type × category),
//     fanning a multi-cell leader into every cell they lead.

const SEP = "2025-09-01";
const OCT = "2025-10-01";

// A one-criterion rubric: the score IS the numeric, banded 90/80/70/60.
const RUBRIC: Rubric = { criteria: [{ key: "c1", label: "C1", weight: 100 }] };

type RowOverride = {
  override_letter: GroupHealthLetter | null;
  override_scope: GradeOverrideScope | null;
  override_period_month: string | null;
};

const noOverride: RowOverride = {
  override_letter: null,
  override_scope: null,
  override_period_month: null,
};

// Mirror the reads layer's per-cell roll-up: map a stored grade row's override
// columns to the structured override the facade consumes, then read the
// effective letter the Multiply grid buckets.
function effective(
  rubric: Rubric,
  scores: Record<string, number>,
  row: RowOverride,
  periodMonthIso: string
): GroupHealthLetter | null {
  const override =
    row.override_letter && row.override_scope
      ? {
          letter: row.override_letter,
          scope: row.override_scope,
          period_month: row.override_period_month ?? periodMonthIso,
        }
      : null;
  return resolveGroupRubricGrade({
    rubric,
    scores,
    override,
    periodMonth: periodMonthIso,
  }).effective_letter;
}

describe("Multiply grid effective letter — recompute from scores", () => {
  it("bands the live score against the current rubric", () => {
    expect(effective(RUBRIC, { c1: 95 }, noOverride, SEP)).toBe("A");
    expect(effective(RUBRIC, { c1: 72 }, noOverride, SEP)).toBe("C");
    expect(effective(RUBRIC, { c1: 40 }, noOverride, SEP)).toBe("F");
  });

  it("returns null when nothing is scored and no override is active", () => {
    expect(effective(RUBRIC, {}, noOverride, SEP)).toBeNull();
  });

  it("ignores scores for criteria no longer in the rubric", () => {
    // A grade saved against an old criterion 'gone' now reads as unscored.
    expect(effective(RUBRIC, { gone: 95 }, noOverride, SEP)).toBeNull();
  });

  it("resolves the Leader facade to the same effective letter as the Group facade", () => {
    // Both per-cell roll-ups (group + leader) feed off symmetric facades over the
    // one core, so a given (scores, override, period) resolves identically.
    const leader = resolveLeaderGrade({
      rubric: RUBRIC,
      scores: { c1: 72 },
      override: null,
      ministryYear: ministryYearOf(new Date(`${SEP}T00:00:00.000Z`)).year ?? 0,
      currentPeriodMonth: SEP,
    });
    expect(leader.letter).toBe(effective(RUBRIC, { c1: 72 }, noOverride, SEP));
  });
});

describe("Multiply grid effective letter — override expiry", () => {
  it("an until_cleared override stands over the computed letter", () => {
    expect(
      effective(
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
      effective(
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
      effective(
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

const CAT_A = "cat-a";
const CAT_B = "cat-b";

function leader(cells: string[], letter: GroupHealthLetter | null) {
  return { cells: new Set(cells), letter };
}

describe("tallyCellHealthGrades — per-cell bucketing", () => {
  it("buckets group grades by CELL, dropping closed, ungraded, and uncategorised rows", () => {
    const out = tallyCellHealthGrades(
      [
        { type: "men", categoryId: CAT_A, isClosed: false, letter: "A" },
        { type: "men", categoryId: CAT_A, isClosed: false, letter: "C" },
        { type: "men", categoryId: CAT_B, isClosed: false, letter: "B" }, // other cell
        { type: "men", categoryId: CAT_A, isClosed: true, letter: "A" }, // closed → dropped
        { type: "men", categoryId: CAT_A, isClosed: false, letter: null }, // ungraded → dropped
        { type: null, categoryId: CAT_A, isClosed: false, letter: "B" }, // no type → dropped
        { type: "men", categoryId: null, isClosed: false, letter: "B" }, // no category → dropped
        { type: "women", categoryId: CAT_A, isClosed: false, letter: "B" },
      ],
      []
    );
    expect(out.get(cellHealthKey("men", CAT_A))?.groupGrades).toEqual([
      "A",
      "C",
    ]);
    expect(out.get(cellHealthKey("men", CAT_B))?.groupGrades).toEqual(["B"]);
    expect(out.get(cellHealthKey("women", CAT_A))?.groupGrades).toEqual(["B"]);
    // The dropped rows never created a "mixed" cell.
    expect(out.has(cellHealthKey("mixed", CAT_A))).toBe(false);
  });

  it("fans a multi-cell leader into every cell they lead", () => {
    const menA = cellHealthKey("men", CAT_A);
    const mixedA = cellHealthKey("mixed", CAT_A);
    const womenB = cellHealthKey("women", CAT_B);
    const out = tallyCellHealthGrades(
      [],
      [leader([menA, mixedA], "B"), leader([womenB], "A")]
    );
    expect(out.get(menA)?.leaderGrades).toEqual(["B"]);
    expect(out.get(mixedA)?.leaderGrades).toEqual(["B"]);
    expect(out.get(womenB)?.leaderGrades).toEqual(["A"]);
  });

  it("drops a leader with no cell or no letter", () => {
    const out = tallyCellHealthGrades(
      [],
      [leader([], "A"), leader([cellHealthKey("men", CAT_A)], null)]
    );
    expect(out.size).toBe(0);
  });
});
