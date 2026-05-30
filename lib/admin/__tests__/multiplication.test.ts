import { describe, expect, it } from "vitest";
import {
  buildPlannerSegments,
  evaluateReadiness,
  filterSegmentsByYear,
  segmentLabel,
  summarizeTargetYears,
  wholeYearsBetween,
} from "@/lib/admin/multiplication";
import type { MultiplicationCandidateEntry } from "@/lib/supabase/read-models";

const TODAY = "2026-05-28";

// Build a candidate entry as the read model returns it, overriding only the
// fields a given test cares about.
function entry(over: {
  id: string;
  groupName?: string;
  audience?: "men" | "women" | "mixed" | null;
  lifeStage?:
    | "young_professionals"
    | "young_families"
    | "retirement"
    | null;
  targetYear?: number | null;
  activeMemberCount?: number;
  launchedOn?: string | null;
  coShepherdSince?: string | null;
  shepherdWilling?: boolean;
  needsSimilarStage?: boolean;
  successorDesignate?: string | null;
}): MultiplicationCandidateEntry {
  return {
    candidate: {
      id: over.id,
      group_id: `g-${over.id}`,
      target_year: over.targetYear ?? null,
      status: "watching",
      shepherd_willing: over.shepherdWilling ?? false,
      needs_similar_stage: over.needsSimilarStage ?? false,
      notes: null,
      successor_designate: over.successorDesignate ?? null,
      meeting_time: null,
      archived_at: null,
      created_by: null,
      updated_by: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    group:
      over.audience === null
        ? null
        : {
            id: `g-${over.id}`,
            name: over.groupName ?? `Group ${over.id}`,
            audience_category: over.audience ?? "men",
            life_stage: over.lifeStage ?? "young_families",
            launched_on: over.launchedOn ?? null,
            lifecycle_status: "active",
          },
    activeMemberCount: over.activeMemberCount ?? 0,
    coShepherdSince: over.coShepherdSince ?? null,
  };
}

describe("wholeYearsBetween", () => {
  it("counts whole years, anniversary-aware", () => {
    expect(wholeYearsBetween("2023-05-28", TODAY)).toBe(3);
    expect(wholeYearsBetween("2023-05-29", TODAY)).toBe(2); // anniversary not reached
    expect(wholeYearsBetween("2026-05-28", TODAY)).toBe(0);
  });

  it("returns null for missing or malformed dates", () => {
    expect(wholeYearsBetween(null, TODAY)).toBeNull();
    expect(wholeYearsBetween("not-a-date", TODAY)).toBeNull();
  });
});

describe("evaluateReadiness (Julian P4 answer 10 criteria)", () => {
  it("marks all criteria met for a ripe group", () => {
    const r = evaluateReadiness(
      {
        activeMemberCount: 14,
        launchedOn: "2022-01-01", // 4+ years
        coShepherdSince: "2024-01-01", // 2+ years
        shepherdWilling: true,
        needsSimilarStage: true,
      },
      TODAY,
    );
    expect(r.criteria).toEqual({
      enough_members: true,
      established_long_enough: true,
      co_shepherd_tenured: true,
      shepherd_willing: true,
      needs_similar_stage: true,
    });
    expect(r.metCount).toBe(5);
    expect(r.totalCount).toBe(5);
  });

  it("flags unmet criteria independently at their boundaries", () => {
    const r = evaluateReadiness(
      {
        activeMemberCount: 11, // below 12
        launchedOn: "2024-06-01", // < 3 years
        coShepherdSince: null, // no co-shepherd
        shepherdWilling: false,
        needsSimilarStage: false,
      },
      TODAY,
    );
    expect(r.criteria.enough_members).toBe(false);
    expect(r.criteria.established_long_enough).toBe(false);
    expect(r.criteria.co_shepherd_tenured).toBe(false);
    expect(r.metCount).toBe(0);
  });

  it("treats exactly 12 members and exactly 3 years as met", () => {
    const r = evaluateReadiness(
      {
        activeMemberCount: 12,
        launchedOn: "2023-05-28",
        coShepherdSince: "2025-05-28",
        shepherdWilling: false,
        needsSimilarStage: false,
      },
      TODAY,
    );
    expect(r.criteria.enough_members).toBe(true);
    expect(r.criteria.established_long_enough).toBe(true);
    expect(r.criteria.co_shepherd_tenured).toBe(true);
  });
});

describe("segmentLabel", () => {
  it("combines audience and life stage", () => {
    expect(segmentLabel("mixed", "retirement")).toBe("Mixed / couples · Retirement");
    expect(segmentLabel("men", null)).toBe("Men");
    expect(segmentLabel(null, null)).toBe("Unsegmented");
  });
});

// Julian #145: the dedicated multiplication surface groups candidates by
// audience × life stage (the Doc's gender-category × age-bracket shape) with
// readiness computed against today. buildPlannerSegments is the pure read
// model the surface renders.
describe("buildPlannerSegments", () => {
  it("groups candidates by audience × life-stage segment, sorted by segment", () => {
    const segments = buildPlannerSegments(
      [
        entry({ id: "1", audience: "women", lifeStage: "retirement" }),
        entry({ id: "2", audience: "men", lifeStage: "young_families" }),
        entry({ id: "3", audience: "men", lifeStage: "young_families" }),
      ],
      TODAY,
    );

    expect(segments.map((s) => s.segment)).toEqual([
      "Men · Young families",
      "Women · Retirement",
    ]);
    const men = segments.find((s) => s.segment === "Men · Young families");
    expect(men!.candidates.map((c) => c.candidateId)).toEqual(["2", "3"]);
  });

  it("computes readiness against today for each candidate", () => {
    const [segment] = buildPlannerSegments(
      [
        entry({
          id: "ripe",
          activeMemberCount: 14,
          launchedOn: "2022-01-01",
          coShepherdSince: "2024-01-01",
          shepherdWilling: true,
          needsSimilarStage: true,
        }),
      ],
      TODAY,
    );
    expect(segment.candidates[0].readiness.metCount).toBe(5);
  });

  it("carries the candidate's target year and successor through to the view", () => {
    const [segment] = buildPlannerSegments(
      [entry({ id: "1", targetYear: 2027, successorDesignate: "Tony L." })],
      TODAY,
    );
    expect(segment.candidates[0].targetYear).toBe(2027);
    expect(segment.candidates[0].successorDesignate).toBe("Tony L.");
  });

  it("buckets groups with missing segmentation under Unsegmented", () => {
    const segments = buildPlannerSegments(
      [entry({ id: "1", audience: null })],
      TODAY,
    );
    expect(segments[0].segment).toBe("Unsegmented");
    expect(segments[0].candidates[0].groupName).toBe("Unknown group");
  });
});

// Julian #145 / R4: the 2026-vs-2027 split must be visible at a glance.
// summarizeTargetYears counts candidates per target year (unset last) so the
// surface can show the split and drive a year filter.
describe("summarizeTargetYears", () => {
  it("counts candidates per target year, years ascending with unset last", () => {
    const segments = buildPlannerSegments(
      [
        entry({ id: "1", targetYear: 2027 }),
        entry({ id: "2", targetYear: 2026 }),
        entry({ id: "3", targetYear: 2026 }),
        entry({ id: "4", targetYear: null }),
      ],
      TODAY,
    );
    expect(summarizeTargetYears(segments)).toEqual([
      { year: 2026, count: 2 },
      { year: 2027, count: 1 },
      { year: null, count: 1 },
    ]);
  });

  it("returns an empty summary when there are no candidates", () => {
    expect(summarizeTargetYears([])).toEqual([]);
  });
});

// Julian #145 / R4: a year filter lets Julian see one cohort at a time. "all"
// is the unfiltered view; a year keeps only that cohort; null keeps the
// not-yet-decided candidates. Segments emptied by the filter drop out so the
// view stays scannable.
describe("filterSegmentsByYear", () => {
  const segments = () =>
    buildPlannerSegments(
      [
        entry({ id: "1", audience: "men", lifeStage: "young_families", targetYear: 2026 }),
        entry({ id: "2", audience: "men", lifeStage: "young_families", targetYear: 2027 }),
        entry({ id: "3", audience: "women", lifeStage: "retirement", targetYear: null }),
      ],
      TODAY,
    );

  it("returns every segment unchanged for 'all'", () => {
    expect(filterSegmentsByYear(segments(), "all")).toEqual(segments());
  });

  it("keeps only candidates matching a given year and drops emptied segments", () => {
    const filtered = filterSegmentsByYear(segments(), 2026);
    expect(filtered.map((s) => s.segment)).toEqual(["Men · Young families"]);
    expect(filtered[0].candidates.map((c) => c.candidateId)).toEqual(["1"]);
  });

  it("keeps only undecided candidates when filtering on null", () => {
    const filtered = filterSegmentsByYear(segments(), null);
    expect(filtered.map((s) => s.segment)).toEqual(["Women · Retirement"]);
    expect(filtered[0].candidates.map((c) => c.candidateId)).toEqual(["3"]);
  });
});

// Julian #143: the successor/leader-designate is a manually-entered
// designation that must stay separate from the derived co-shepherd tenure
// signal — it must never feed or alter readiness. Readiness depends only on
// its documented inputs, so any extra fields a caller passes (e.g. a
// successor) cannot change the result.
describe("evaluateReadiness ignores fields outside its contract (#143)", () => {
  it("computes identical readiness regardless of an extra successor field", () => {
    const base = {
      activeMemberCount: 12,
      launchedOn: "2023-05-28",
      coShepherdSince: "2025-05-28",
      shepherdWilling: true,
      needsSimilarStage: true,
    };
    const withSuccessor = {
      ...base,
      // Not part of ReadinessInput; must be inert.
      successorDesignate: "Tony L.",
    } as typeof base;

    expect(evaluateReadiness(withSuccessor, TODAY)).toEqual(
      evaluateReadiness(base, TODAY),
    );
  });
});
