import { describe, expect, it } from "vitest";
import {
  buildPlannerSegments,
  evaluateReadiness,
  filterSegmentsByYear,
  segmentLabel,
  summarizeTargetYears,
  UNTYPED_SEGMENT,
  wholeYearsBetween,
} from "@/lib/admin/multiplication";
import type { MultiplicationCandidateEntry } from "@/lib/supabase/read-models";

const TODAY = "2026-05-28";

// Build a candidate entry as the read model returns it, overriding only the
// fields a given test cares about. Segmentation now derives from the anchoring
// group's free-text group_type (null = Untyped); the cell model is retired.
function entry(over: {
  id: string;
  groupName?: string;
  // The anchoring group's free-text type (null = Untyped). Ignored when the
  // candidate has no group (groupId: null).
  groupType?: string | null;
  // The multiplying group id; default `g-<id>`. Pass null for a type-only watch
  // (no attached group).
  groupId?: string | null;
  targetYear?: number | null;
  activeMemberCount?: number;
  // ADR 0022: Julian-fed headcount; null = fall back to activeMemberCount.
  manualMemberCount?: number | null;
  launchedOn?: string | null;
  coShepherdSince?: string | null;
  shepherdWilling?: boolean;
  needsSimilarStage?: boolean;
  successorDesignate?: string | null;
}): MultiplicationCandidateEntry {
  const groupId = over.groupId === undefined ? `g-${over.id}` : over.groupId;
  return {
    candidate: {
      id: over.id,
      group_id: groupId,
      target_year: over.targetYear ?? null,
      status: "watching",
      shepherd_willing: over.shepherdWilling ?? false,
      needs_similar_stage: over.needsSimilarStage ?? false,
      notes: null,
      successor_designate: over.successorDesignate ?? null,
      meeting_time: null,
      leader_pipeline_id: null,
      manual_member_count: over.manualMemberCount ?? null,
      archived_at: null,
      created_by: null,
      updated_by: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    group:
      groupId === null
        ? null
        : {
            id: groupId,
            name: over.groupName ?? `Group ${over.id}`,
            group_type: over.groupType === undefined ? "Men's" : over.groupType,
            launched_on: over.launchedOn ?? null,
            lifecycle_status: "active",
          },
    activeMemberCount: over.activeMemberCount ?? 0,
    coShepherdSince: over.coShepherdSince ?? null,
    linkedApprentice: null,
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
      TODAY
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
      TODAY
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
      TODAY
    );
    expect(r.criteria.enough_members).toBe(true);
    expect(r.criteria.established_long_enough).toBe(true);
    expect(r.criteria.co_shepherd_tenured).toBe(true);
  });
});

describe("segmentLabel (free-text group_type)", () => {
  it("returns the trimmed type name as the segment", () => {
    expect(segmentLabel("Men's")).toBe("Men's");
    expect(segmentLabel("  Retirement  ")).toBe("Retirement");
  });

  it("resolves a null or blank type to the visible Untyped bucket", () => {
    expect(segmentLabel(null)).toBe("Untyped");
    expect(segmentLabel("   ")).toBe("Untyped");
    expect(segmentLabel(null)).toBe(UNTYPED_SEGMENT);
  });
});

// Julian #145 / #398: the dedicated multiplication surface groups candidates by
// the anchoring group's free-text group_type, with readiness computed against
// today. buildPlannerSegments is the pure read model the surface renders.
describe("buildPlannerSegments", () => {
  it("groups candidates by group_type segment, sorted by segment", () => {
    const segments = buildPlannerSegments(
      [
        entry({ id: "1", groupType: "Women's" }),
        entry({ id: "2", groupType: "Men's" }),
        entry({ id: "3", groupType: "Men's" }),
      ],
      TODAY
    );

    expect(segments.map((s) => s.segment)).toEqual(["Men's", "Women's"]);
    const men = segments.find((s) => s.segment === "Men's");
    expect(men!.candidates.map((c) => c.candidateId)).toEqual(["2", "3"]);
  });

  it("buckets a tagged group under its free-text type", () => {
    const segments = buildPlannerSegments(
      [entry({ id: "1", groupType: "20-30s" })],
      TODAY
    );
    expect(segments[0].segment).toBe("20-30s");
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
      TODAY
    );
    expect(segment.candidates[0].readiness.metCount).toBe(5);
  });

  it("carries the candidate's target year and successor through to the view", () => {
    const [segment] = buildPlannerSegments(
      [entry({ id: "1", targetYear: 2027, successorDesignate: "Tony L." })],
      TODAY
    );
    expect(segment.candidates[0].targetYear).toBe(2027);
    expect(segment.candidates[0].successorDesignate).toBe("Tony L.");
  });

  it("carries the group_type through to the candidate view", () => {
    const [segment] = buildPlannerSegments(
      [entry({ id: "1", groupType: "Retirement" })],
      TODAY
    );
    expect(segment.candidates[0].groupType).toBe("Retirement");
  });

  it("buckets a type-only watch (no group) under Untyped", () => {
    const segments = buildPlannerSegments(
      [entry({ id: "1", groupId: null })],
      TODAY
    );
    expect(segments[0].segment).toBe("Untyped");
    expect(segments[0].candidates[0].groupName).toBe("(no group)");
  });

  it("buckets a group with no type (null group_type) under Untyped", () => {
    const segments = buildPlannerSegments(
      [entry({ id: "1", groupType: null })],
      TODAY
    );
    // A null group_type collects in the visible Untyped bucket admins use to
    // find groups still needing a tag.
    expect(segments[0].segment).toBe(UNTYPED_SEGMENT);
    expect(segments[0].candidates[0].groupType).toBeNull();
  });
});

// ADR 0022: Julian-fed headcount. The manual count, when present, is the
// effective member count the planner displays AND the value the "12+ members"
// readiness criterion reads — overriding the in-app roster count. A null manual
// count falls back to the roster count so seeded candidates aren't "0 members"
// until backfilled.
describe("buildPlannerSegments — Julian-fed member count (ADR 0022)", () => {
  it("uses the manual count for the effective memberCount and the criterion when set", () => {
    const [segment] = buildPlannerSegments(
      [entry({ id: "1", activeMemberCount: 4, manualMemberCount: 13 })],
      TODAY
    );
    const c = segment.candidates[0];
    expect(c.memberCount).toBe(13);
    expect(c.manualMemberCount).toBe(13);
    // 13 ≥ 12, so the criterion is met even though the roster count (4) is not.
    expect(c.readiness.criteria.enough_members).toBe(true);
  });

  it("falls back to the roster count for display and the criterion when manual is null", () => {
    const [segment] = buildPlannerSegments(
      [entry({ id: "1", activeMemberCount: 14, manualMemberCount: null })],
      TODAY
    );
    const c = segment.candidates[0];
    expect(c.memberCount).toBe(14);
    expect(c.manualMemberCount).toBeNull();
    expect(c.readiness.criteria.enough_members).toBe(true);
  });

  it("evaluates the 12-member boundary against the manual count", () => {
    const below = buildPlannerSegments(
      [entry({ id: "below", activeMemberCount: 30, manualMemberCount: 11 })],
      TODAY
    )[0].candidates[0];
    const at = buildPlannerSegments(
      [entry({ id: "at", activeMemberCount: 0, manualMemberCount: 12 })],
      TODAY
    )[0].candidates[0];

    // Manual 11 fails the criterion even though the roster (30) would pass —
    // the manual value is authoritative.
    expect(below.memberCount).toBe(11);
    expect(below.readiness.criteria.enough_members).toBe(false);
    // Manual 12 passes even though the roster (0) would fail.
    expect(at.memberCount).toBe(12);
    expect(at.readiness.criteria.enough_members).toBe(true);
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
      TODAY
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
        entry({ id: "1", groupType: "Men's", targetYear: 2026 }),
        entry({ id: "2", groupType: "Men's", targetYear: 2027 }),
        entry({ id: "3", groupType: "Women's", targetYear: null }),
      ],
      TODAY
    );

  it("returns every segment unchanged for 'all'", () => {
    expect(filterSegmentsByYear(segments(), "all")).toEqual(segments());
  });

  it("keeps only candidates matching a given year and drops emptied segments", () => {
    const filtered = filterSegmentsByYear(segments(), 2026);
    expect(filtered.map((s) => s.segment)).toEqual(["Men's"]);
    expect(filtered[0].candidates.map((c) => c.candidateId)).toEqual(["1"]);
  });

  it("keeps only undecided candidates when filtering on null", () => {
    const filtered = filterSegmentsByYear(segments(), null);
    expect(filtered.map((s) => s.segment)).toEqual(["Women's"]);
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
      evaluateReadiness(base, TODAY)
    );
  });
});
