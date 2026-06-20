import { describe, expect, it } from "vitest";
import {
  buildPlannerSegments,
  evaluateReadiness,
  filterSegmentsByYear,
  segmentLabel,
  summarizeTargetYears,
  UNTYPED_SEGMENT,
} from "@/lib/admin/multiplication";
import type { MultiplicationCandidateEntry } from "@/lib/supabase/read-models";

// Build a candidate entry as the read model returns it, overriding only the
// fields a given test cares about. Segmentation now derives from the anchoring
// group's free-text group_type (null = Untyped); the cell model is retired.
// ADR 0029: all five readiness criteria are stored manual flags on the
// candidate — none are computed from dates or member counts anymore.
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
  // The five manual readiness flags (ADR 0029).
  shepherdWilling?: boolean;
  needsSimilarStage?: boolean;
  enoughMembers?: boolean;
  establishedLongEnough?: boolean;
  coShepherdTenured?: boolean;
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
      enough_members: over.enoughMembers ?? false,
      established_long_enough: over.establishedLongEnough ?? false,
      co_shepherd_tenured: over.coShepherdTenured ?? false,
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
            launched_on: null,
            lifecycle_status: "active",
          },
    activeMemberCount: over.activeMemberCount ?? 0,
    linkedApprentice: null,
  };
}

// ADR 0029: readiness reads the five stored manual flags straight off the
// candidate; metCount is the number ticked. No dates or member counts feed it.
describe("evaluateReadiness (ADR 0029 manual checklist)", () => {
  it("reflects exactly the flags ticked, all five met", () => {
    const r = evaluateReadiness({
      enoughMembers: true,
      establishedLongEnough: true,
      coShepherdTenured: true,
      shepherdWilling: true,
      needsSimilarStage: true,
    });
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

  it("reports none met when nothing is ticked", () => {
    const r = evaluateReadiness({
      enoughMembers: false,
      establishedLongEnough: false,
      coShepherdTenured: false,
      shepherdWilling: false,
      needsSimilarStage: false,
    });
    expect(r.criteria.enough_members).toBe(false);
    expect(r.criteria.established_long_enough).toBe(false);
    expect(r.criteria.co_shepherd_tenured).toBe(false);
    expect(r.criteria.shepherd_willing).toBe(false);
    expect(r.criteria.needs_similar_stage).toBe(false);
    expect(r.metCount).toBe(0);
  });

  it("counts each flag independently — metCount is the number ticked", () => {
    const r = evaluateReadiness({
      enoughMembers: true,
      establishedLongEnough: false,
      coShepherdTenured: true,
      shepherdWilling: false,
      needsSimilarStage: true,
    });
    expect(r.criteria.enough_members).toBe(true);
    expect(r.criteria.established_long_enough).toBe(false);
    expect(r.criteria.co_shepherd_tenured).toBe(true);
    expect(r.metCount).toBe(3);
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
// the anchoring group's free-text group_type, with readiness read off each
// candidate's stored flags. buildPlannerSegments is the pure read model the
// surface renders.
describe("buildPlannerSegments", () => {
  it("groups candidates by group_type segment, sorted by segment", () => {
    const segments = buildPlannerSegments([
      entry({ id: "1", groupType: "Women's" }),
      entry({ id: "2", groupType: "Men's" }),
      entry({ id: "3", groupType: "Men's" }),
    ]);

    expect(segments.map((s) => s.segment)).toEqual(["Men's", "Women's"]);
    const men = segments.find((s) => s.segment === "Men's");
    expect(men!.candidates.map((c) => c.candidateId)).toEqual(["2", "3"]);
  });

  it("buckets a tagged group under its free-text type", () => {
    const segments = buildPlannerSegments([
      entry({ id: "1", groupType: "20-30s" }),
    ]);
    expect(segments[0].segment).toBe("20-30s");
  });

  it("reads readiness from each candidate's stored manual flags", () => {
    const [segment] = buildPlannerSegments([
      entry({
        id: "ripe",
        enoughMembers: true,
        establishedLongEnough: true,
        coShepherdTenured: true,
        shepherdWilling: true,
        needsSimilarStage: true,
      }),
    ]);
    expect(segment.candidates[0].readiness.metCount).toBe(5);
    expect(segment.candidates[0].readiness.criteria.enough_members).toBe(true);
  });

  it("surfaces the three new manual flags on the candidate view for the edit form", () => {
    const [segment] = buildPlannerSegments([
      entry({
        id: "1",
        enoughMembers: true,
        establishedLongEnough: false,
        coShepherdTenured: true,
      }),
    ]);
    const c = segment.candidates[0];
    expect(c.enoughMembers).toBe(true);
    expect(c.establishedLongEnough).toBe(false);
    expect(c.coShepherdTenured).toBe(true);
  });

  it("carries the candidate's target year and successor through to the view", () => {
    const [segment] = buildPlannerSegments([
      entry({ id: "1", targetYear: 2027, successorDesignate: "Tony L." }),
    ]);
    expect(segment.candidates[0].targetYear).toBe(2027);
    expect(segment.candidates[0].successorDesignate).toBe("Tony L.");
  });

  it("carries the group_type through to the candidate view", () => {
    const [segment] = buildPlannerSegments([
      entry({ id: "1", groupType: "Retirement" }),
    ]);
    expect(segment.candidates[0].groupType).toBe("Retirement");
  });

  it("buckets a type-only watch (no group) under Untyped", () => {
    const segments = buildPlannerSegments([entry({ id: "1", groupId: null })]);
    expect(segments[0].segment).toBe("Untyped");
    expect(segments[0].candidates[0].groupName).toBe("(no group)");
  });

  it("buckets a group with no type (null group_type) under Untyped", () => {
    const segments = buildPlannerSegments([
      entry({ id: "1", groupType: null }),
    ]);
    // A null group_type collects in the visible Untyped bucket admins use to
    // find groups still needing a tag.
    expect(segments[0].segment).toBe(UNTYPED_SEGMENT);
    expect(segments[0].candidates[0].groupType).toBeNull();
  });
});

// ADR 0022: Julian-fed headcount. The manual count, when present, is the
// effective member count the planner DISPLAYS, overriding the in-app roster
// count. ADR 0029 decoupled it from readiness — the "12+ members" criterion is
// now a manual flag, not derived from this count — so these tests assert the
// displayed memberCount only.
describe("buildPlannerSegments — Julian-fed member count (ADR 0022)", () => {
  it("uses the manual count for the effective memberCount when set", () => {
    const [segment] = buildPlannerSegments([
      entry({ id: "1", activeMemberCount: 4, manualMemberCount: 13 }),
    ]);
    const c = segment.candidates[0];
    expect(c.memberCount).toBe(13);
    expect(c.manualMemberCount).toBe(13);
  });

  it("falls back to the roster count for display when manual is null", () => {
    const [segment] = buildPlannerSegments([
      entry({ id: "1", activeMemberCount: 14, manualMemberCount: null }),
    ]);
    const c = segment.candidates[0];
    expect(c.memberCount).toBe(14);
    expect(c.manualMemberCount).toBeNull();
  });

  it("no longer derives the enough_members criterion from the count", () => {
    // A 30-member roster does NOT auto-tick "12+ members" — the flag is manual.
    const [segment] = buildPlannerSegments([
      entry({ id: "1", activeMemberCount: 30, enoughMembers: false }),
    ]);
    expect(segment.candidates[0].readiness.criteria.enough_members).toBe(false);
  });
});

// Julian #145 / R4: the 2026-vs-2027 split must be visible at a glance.
// summarizeTargetYears counts candidates per target year (unset last) so the
// surface can show the split and drive a year filter.
describe("summarizeTargetYears", () => {
  it("counts candidates per target year, years ascending with unset last", () => {
    const segments = buildPlannerSegments([
      entry({ id: "1", targetYear: 2027 }),
      entry({ id: "2", targetYear: 2026 }),
      entry({ id: "3", targetYear: 2026 }),
      entry({ id: "4", targetYear: null }),
    ]);
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
    buildPlannerSegments([
      entry({ id: "1", groupType: "Men's", targetYear: 2026 }),
      entry({ id: "2", groupType: "Men's", targetYear: 2027 }),
      entry({ id: "3", groupType: "Women's", targetYear: null }),
    ]);

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
