import { describe, expect, it } from "vitest";
import {
  buildPipelineView,
  buildPlannerSegments,
  evaluateReadiness,
  filterSegmentsByYear,
  segmentLabel,
  summarizeTargetYears,
  UNTYPED_SEGMENT,
} from "@/lib/admin/multiplication";
import type { SegmentableGroup } from "@/lib/admin/multiplication";
import type { MultiplicationCandidateEntry } from "@/lib/supabase/read-models";

// Build a candidate entry as the read model returns it, overriding only the
// fields a given test cares about. Segmentation derives from the anchoring
// group's free-text group_type (null = Untyped); the cell model is retired.
// ADR 0029: readiness reads the five stored boolean flags on the candidate — no
// dates or roster count.
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
  // ADR 0029: the five stored readiness flags.
  enoughMembers?: boolean;
  establishedLongEnough?: boolean;
  coShepherdTenured?: boolean;
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

const ALL_FALSE = {
  enoughMembers: false,
  establishedLongEnough: false,
  coShepherdTenured: false,
  shepherdWilling: false,
  needsSimilarStage: false,
};

// ADR 0029: the five criteria are now plain stored booleans Julian ticks
// himself. evaluateReadiness reports each independently plus a met-count, with
// no dependence on dates or roster count.
describe("evaluateReadiness (ADR 0029 — five manual flags)", () => {
  it("marks all five met when every flag is ticked", () => {
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

  it("reports zero met when no flag is ticked", () => {
    const r = evaluateReadiness(ALL_FALSE);
    expect(r.metCount).toBe(0);
    expect(r.totalCount).toBe(5);
    expect(Object.values(r.criteria).every((v) => v === false)).toBe(true);
  });

  it("counts a partial checklist, each criterion independently", () => {
    const r = evaluateReadiness({
      enoughMembers: true,
      establishedLongEnough: false,
      coShepherdTenured: true,
      shepherdWilling: false,
      needsSimilarStage: true,
    });
    expect(r.criteria).toEqual({
      enough_members: true,
      established_long_enough: false,
      co_shepherd_tenured: true,
      shepherd_willing: false,
      needs_similar_stage: true,
    });
    expect(r.metCount).toBe(3);
  });

  it("reads only the five booleans — no dependence on dates or roster count", () => {
    const base = {
      ...ALL_FALSE,
      enoughMembers: true,
      shepherdWilling: true,
    };
    // Extra fields a caller might pass (the old computed inputs) are inert.
    const withExtras = {
      ...base,
      activeMemberCount: 99,
      launchedOn: "2000-01-01",
      coShepherdSince: "2000-01-01",
    } as typeof base;
    expect(evaluateReadiness(withExtras)).toEqual(evaluateReadiness(base));
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
// the anchoring group's free-text group_type, with readiness read from each
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

  it("derives readiness from the candidate's five stored flags", () => {
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
    const c = segment.candidates[0];
    expect(c.readiness.metCount).toBe(5);
    expect(c.readiness.criteria).toEqual({
      enough_members: true,
      established_long_enough: true,
      co_shepherd_tenured: true,
      shepherd_willing: true,
      needs_similar_stage: true,
    });
  });

  it("carries each stored flag through to the candidate view", () => {
    const [segment] = buildPlannerSegments([
      entry({
        id: "1",
        enoughMembers: true,
        coShepherdTenured: true,
        needsSimilarStage: true,
      }),
    ]);
    const c = segment.candidates[0];
    expect(c.enoughMembers).toBe(true);
    expect(c.establishedLongEnough).toBe(false);
    expect(c.coShepherdTenured).toBe(true);
    expect(c.shepherdWilling).toBe(false);
    expect(c.needsSimilarStage).toBe(true);
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

// ADR 0022/0029: the member count is now display-only. The manual count, when
// present, is the effective member count shown on the candidate summary line;
// a null manual count falls back to the roster count. Readiness no longer reads
// it — "12+ members" is a stored flag Julian ticks.
describe("buildPlannerSegments — member count is display-only", () => {
  it("uses the manual count for the effective memberCount when set", () => {
    const [segment] = buildPlannerSegments([
      entry({ id: "1", activeMemberCount: 4, manualMemberCount: 13 }),
    ]);
    const c = segment.candidates[0];
    expect(c.memberCount).toBe(13);
    expect(c.manualMemberCount).toBe(13);
  });

  it("falls back to the roster count when manual is null", () => {
    const [segment] = buildPlannerSegments([
      entry({ id: "1", activeMemberCount: 14, manualMemberCount: null }),
    ]);
    const c = segment.candidates[0];
    expect(c.memberCount).toBe(14);
    expect(c.manualMemberCount).toBeNull();
  });

  it("reads enough_members from the stored flag, never the member count", () => {
    // High roster + manual, but the flag is unticked → criterion unmet.
    const unticked = buildPlannerSegments([
      entry({
        id: "a",
        activeMemberCount: 30,
        manualMemberCount: 30,
        enoughMembers: false,
      }),
    ])[0].candidates[0];
    expect(unticked.readiness.criteria.enough_members).toBe(false);
    // Zero members, but the flag is ticked → criterion met.
    const ticked = buildPlannerSegments([
      entry({
        id: "b",
        activeMemberCount: 0,
        manualMemberCount: 0,
        enoughMembers: true,
      }),
    ])[0].candidates[0];
    expect(ticked.readiness.criteria.enough_members).toBe(true);
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

// ADR 0030 Module 3 (#756): the type-first Pipeline. buildPipelineView takes the
// pipelined types, the active groups with no candidate row (potential pool), and
// the saved candidates, and partitions each pipelined type into potential vs
// locked-in candidates. Realistic locked-in candidates come from
// buildPlannerSegments so the views carry the real CandidateView shape.
describe("buildPipelineView (ADR 0030 — type-first Pipeline)", () => {
  function group(over: {
    id: string;
    name?: string;
    groupType?: string | null;
  }): SegmentableGroup {
    return {
      id: over.id,
      name: over.name ?? `Group ${over.id}`,
      groupType: over.groupType ?? null,
    };
  }

  // Flatten the planner segments into the flat CandidateView[] the Pipeline view
  // partitions (one locked-in candidate per saved row, across all types).
  function candidates(...entries: Parameters<typeof entry>[0][]) {
    return buildPlannerSegments(entries.map(entry)).flatMap(
      (s) => s.candidates
    );
  }

  it("partitions a pipelined type into potential vs locked-in candidates", () => {
    const view = buildPipelineView(
      ["Young Families"],
      [
        group({ id: "yf-open", name: "Smiths", groupType: "Young Families" }),
        // A different type is not a potential candidate of Young Families.
        group({ id: "mens", name: "Men's AM", groupType: "Men's" }),
      ],
      candidates({ id: "c1", groupName: "Jones", groupType: "Young Families" })
    );

    expect(view).toHaveLength(1);
    const [yf] = view;
    expect(yf.type).toBe("Young Families");
    expect(yf.potentialCandidates.map((p) => p.groupName)).toEqual(["Smiths"]);
    expect(yf.lockedInCandidates.map((c) => c.groupName)).toEqual(["Jones"]);
  });

  it("locked-in candidates carry their five-box readiness through", () => {
    const [yf] = buildPipelineView(
      ["Young Families"],
      [],
      candidates({
        id: "c1",
        groupType: "Young Families",
        enoughMembers: true,
        coShepherdTenured: true,
        needsSimilarStage: true,
      })
    );
    expect(yf.lockedInCandidates[0].readiness.metCount).toBe(3);
    expect(yf.lockedInCandidates[0].readiness.criteria.enough_members).toBe(
      true
    );
  });

  it("renders a pipelined type with zero groups and zero candidates (never-block)", () => {
    const view = buildPipelineView(["Young Families"], [], []);
    expect(view).toHaveLength(1);
    expect(view[0].type).toBe("Young Families");
    expect(view[0].potentialCandidates).toEqual([]);
    expect(view[0].lockedInCandidates).toEqual([]);
  });

  it("excludes non-pipelined types' groups and candidates", () => {
    const view = buildPipelineView(
      ["Young Families"],
      [group({ id: "g1", groupType: "Men's" })],
      candidates({ id: "c1", groupType: "Women's" })
    );
    // Only the one pipelined type is present; the Men's/Women's data is dropped.
    expect(view.map((t) => t.type)).toEqual(["Young Families"]);
    expect(view[0].potentialCandidates).toEqual([]);
    expect(view[0].lockedInCandidates).toEqual([]);
  });

  it("sorts types by label", () => {
    const view = buildPipelineView(
      ["Women's", "Men's", "Young Families"],
      [],
      []
    );
    expect(view.map((t) => t.type)).toEqual([
      "Men's",
      "Women's",
      "Young Families",
    ]);
  });

  it("sorts an Untyped arm last (defensive)", () => {
    const view = buildPipelineView([UNTYPED_SEGMENT, "Men's"], [], []);
    expect(view.map((t) => t.type)).toEqual(["Men's", UNTYPED_SEGMENT]);
  });

  it("matches groups and candidates case-insensitively to the pipelined type", () => {
    const [yf] = buildPipelineView(
      ["Young Families"],
      [group({ id: "g1", name: "Lowercased", groupType: "young families" })],
      candidates({ id: "c1", groupName: "Mixed", groupType: "YOUNG FAMILIES" })
    );
    expect(yf.potentialCandidates.map((p) => p.groupName)).toEqual([
      "Lowercased",
    ]);
    expect(yf.lockedInCandidates.map((c) => c.groupName)).toEqual(["Mixed"]);
  });

  it("dedupes a repeated pipelined type and skips blanks", () => {
    const view = buildPipelineView(["Men's", "  ", "men's"], [], []);
    expect(view.map((t) => t.type)).toEqual(["Men's"]);
  });

  it("sorts potential and locked-in candidates by name", () => {
    const [yf] = buildPipelineView(
      ["Young Families"],
      [
        group({ id: "b", name: "Bravo", groupType: "Young Families" }),
        group({ id: "a", name: "Alpha", groupType: "Young Families" }),
      ],
      candidates(
        { id: "z", groupName: "Zulu", groupType: "Young Families" },
        { id: "m", groupName: "Mike", groupType: "Young Families" }
      )
    );
    expect(yf.potentialCandidates.map((p) => p.groupName)).toEqual([
      "Alpha",
      "Bravo",
    ]);
    expect(yf.lockedInCandidates.map((c) => c.groupName)).toEqual([
      "Mike",
      "Zulu",
    ]);
  });

  it("derives a stable anchor id from the type label (deep-link seam)", () => {
    const [yf] = buildPipelineView(["Young Families"], [], []);
    expect(yf.anchorId).toBe("seg-young-families");
  });
});
