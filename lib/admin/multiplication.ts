// Julian P4: multiplication readiness + segmentation helpers. Pure functions,
// no I/O — the read model supplies the inputs, these compute the rest so they
// can be unit-tested with bare objects.
//
// Readiness criteria are Julian's, from LG_MULTIPLICATION_PLAN_2026.md and
// systems-conversation answer 10:
//   * 12+ members in the group
//   * 3+ years meeting as a group
//   * a co-shepherd serving 1+ year
//   * the shepherd is willing to multiply
//   * there is a need for a similar-stage group
// ADR 0029 made all five purely manual, candidate-stored boolean flags Julian
// ticks himself — a judgment checklist, not a derived signal. The thresholds in
// the labels ("12+", "3+ yr", "1+ yr") are advisory text now; no date math or
// roster count is read for readiness. "A group does not need to meet each of
// these criteria" — so we report each one independently plus a met-count,
// rather than a single pass/fail.

import type {
  LeaderReadinessStage,
  MultiplicationCandidateStatus,
  MultiplicationMeetingTime,
} from "@/types/enums";
import type { MultiplicationCandidateEntry } from "@/lib/supabase/read-models";

export type MultiplicationCriterion =
  | "enough_members"
  | "established_long_enough"
  | "co_shepherd_tenured"
  | "shepherd_willing"
  | "needs_similar_stage";

// ADR 0029: the five stored booleans, exactly as Julian ticked them. No
// data-derived inputs (launched_on, co-shepherd tenure, roster count) — those
// were dropped when the three formerly-computed criteria became manual flags.
export type ReadinessInput = {
  enoughMembers: boolean;
  establishedLongEnough: boolean;
  coShepherdTenured: boolean;
  shepherdWilling: boolean;
  needsSimilarStage: boolean;
};

export type ReadinessResult = {
  criteria: Record<MultiplicationCriterion, boolean>;
  metCount: number;
  totalCount: number;
};

export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const criteria: Record<MultiplicationCriterion, boolean> = {
    enough_members: input.enoughMembers,
    established_long_enough: input.establishedLongEnough,
    co_shepherd_tenured: input.coShepherdTenured,
    shepherd_willing: input.shepherdWilling,
    needs_similar_stage: input.needsSimilarStage,
  };

  const values = Object.values(criteria);
  return {
    criteria,
    metCount: values.filter(Boolean).length,
    totalCount: values.length,
  };
}

export const CRITERION_LABEL: Record<MultiplicationCriterion, string> = {
  enough_members: "12+ members",
  established_long_enough: "3+ years",
  co_shepherd_tenured: "Co-Shepherd 1+ yr",
  shepherd_willing: "Shepherd willing",
  needs_similar_stage: "Need for similar group",
};

export const CANDIDATE_STATUS_LABEL: Record<
  MultiplicationCandidateStatus,
  string
> = {
  watching: "Watching",
  planned: "Planned",
  launched: "Launched",
  deferred: "Deferred",
};

// The visible bucket for groups that carry no group_type (Untyped). Untyped
// groups are never dropped from the segmentation surface; they collect here so
// an admin can see and tag them.
export const UNTYPED_SEGMENT = "Untyped";

// A human-readable segment key for grouping by the free-text group_type. A null
// / empty type resolves to the Untyped bucket.
export function segmentLabel(groupType: string | null): string {
  const label = groupType?.trim() || null;
  return label ?? UNTYPED_SEGMENT;
}

// ADR 0022: a stable DOM anchor id for a segment, so the Readiness grid can
// deep-link a cell to the matching segment block in the Pipeline tab
// (/admin/multiply?tab=pipeline#<id>). Derived from segmentLabel so the grid and the
// planner agree on the same id without sharing state — lowercase, with any run of
// non-alphanumeric characters collapsed to a single hyphen.
export function segmentAnchorId(segment: string): string {
  const slug = segment
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `seg-${slug || "uncategorized"}`;
}

// The per-candidate facts the planner surface renders: the group identity, the
// editable planning fields, and the derived readiness. Computed once on the
// server so the client component stays presentational.
export type CandidateView = {
  candidateId: string;
  // A candidate always anchors to a concrete group; the segment is derived from
  // that group's free-text group_type.
  groupId: string | null;
  groupName: string;
  // The group's free-text type (null = Untyped). Derived from the group.
  groupType: string | null;
  segment: string;
  targetYear: number | null;
  status: MultiplicationCandidateStatus;
  // ADR 0029: the five manual readiness flags, as stored on the candidate.
  enoughMembers: boolean;
  establishedLongEnough: boolean;
  coShepherdTenured: boolean;
  shepherdWilling: boolean;
  needsSimilarStage: boolean;
  notes: string | null;
  successorDesignate: string | null;
  meetingTime: MultiplicationMeetingTime | null;
  // The in-app roster count (active group_memberships).
  activeMemberCount: number;
  // ADR 0022: Julian's manually-entered headcount, or null when unset.
  manualMemberCount: number | null;
  // The EFFECTIVE count the planner displays on the candidate summary line: the
  // manual value when Julian has entered one, else the roster count. ADR 0029:
  // this is display-only now — the "12+ members" criterion is a manual flag.
  memberCount: number;
  readiness: ReadinessResult;
  // Capacity & Multiplication #184: the linked apprentice (leader_pipeline),
  // shown inline. Null when the candidate has no link.
  leaderPipelineId: string | null;
  linkedApprentice: {
    id: string;
    displayName: string;
    stage: LeaderReadinessStage;
  } | null;
};

export type SegmentGroup = { segment: string; candidates: CandidateView[] };

// Julian #145 / #398: turn the read model's enriched candidate entries into the
// segmented, readiness-scored view the planner renders. Grouped by the anchoring
// group's free-text type and sorted by segment label so the layout is stable and
// scannable. Untagged groups bucket under "Untyped" (segmentLabel) so they are
// never dropped. Pure — ADR 0029 readiness reads the candidate's stored flags,
// so no `todayIso` is needed.
export function buildPlannerSegments(
  entries: MultiplicationCandidateEntry[]
): SegmentGroup[] {
  const segmentMap = new Map<string, SegmentGroup>();
  for (const entry of entries) {
    // Bucket by the anchoring group's free-text type (null = Untyped).
    const groupType = entry.group?.group_type ?? null;
    const segment = segmentLabel(groupType);
    // ADR 0022: Julian-fed headcount wins; fall back to the in-app roster count
    // when he hasn't entered one (so seeded candidates aren't shown as "0
    // members" until backfilled). The effective count drives both the display
    // and the "12+ members" readiness criterion.
    const memberCount =
      entry.candidate.manual_member_count ?? entry.activeMemberCount;
    const view: CandidateView = {
      candidateId: entry.candidate.id,
      groupId: entry.candidate.group_id,
      groupName:
        entry.group?.name ??
        (entry.candidate.group_id ? "Unknown group" : "(no group)"),
      groupType,
      segment,
      targetYear: entry.candidate.target_year,
      status: entry.candidate.status,
      enoughMembers: entry.candidate.enough_members,
      establishedLongEnough: entry.candidate.established_long_enough,
      coShepherdTenured: entry.candidate.co_shepherd_tenured,
      shepherdWilling: entry.candidate.shepherd_willing,
      needsSimilarStage: entry.candidate.needs_similar_stage,
      notes: entry.candidate.notes,
      successorDesignate: entry.candidate.successor_designate,
      meetingTime: entry.candidate.meeting_time,
      activeMemberCount: entry.activeMemberCount,
      manualMemberCount: entry.candidate.manual_member_count,
      memberCount,
      leaderPipelineId: entry.candidate.leader_pipeline_id,
      linkedApprentice: entry.linkedApprentice,
      // ADR 0029: readiness reads exactly the five stored flags — no date math
      // or roster count.
      readiness: evaluateReadiness({
        enoughMembers: entry.candidate.enough_members,
        establishedLongEnough: entry.candidate.established_long_enough,
        coShepherdTenured: entry.candidate.co_shepherd_tenured,
        shepherdWilling: entry.candidate.shepherd_willing,
        needsSimilarStage: entry.candidate.needs_similar_stage,
      }),
    };
    const bucket = segmentMap.get(segment);
    if (bucket) bucket.candidates.push(view);
    else segmentMap.set(segment, { segment, candidates: [view] });
  }
  return [...segmentMap.values()].sort((a, b) =>
    a.segment.localeCompare(b.segment)
  );
}

// The active year filter: "all" shows every cohort; a number shows that
// target year; null shows the candidates whose year is not yet decided.
export type TargetYearFilter = number | null | "all";

// Julian #145 / R4: narrow the segmented view to a single target-year cohort.
// "all" is a pass-through; any other value keeps only the matching candidates
// and drops segments left empty so the surface stays scannable.
export function filterSegmentsByYear(
  segments: SegmentGroup[],
  filter: TargetYearFilter
): SegmentGroup[] {
  if (filter === "all") return segments;
  return segments
    .map((segment) => ({
      segment: segment.segment,
      candidates: segment.candidates.filter((c) => c.targetYear === filter),
    }))
    .filter((segment) => segment.candidates.length > 0);
}

export type TargetYearTally = { year: number | null; count: number };

// Julian #145 / R4: count candidates per target year so the planner can show
// the 2026-vs-2027 split at a glance and offer a year filter. Years sort
// ascending; the "unset" bucket (no year decided yet) sorts last because it is
// the work still to be resolved.
export function summarizeTargetYears(
  segments: SegmentGroup[]
): TargetYearTally[] {
  const counts = new Map<number | null, number>();
  for (const segment of segments) {
    for (const c of segment.candidates) {
      counts.set(c.targetYear, (counts.get(c.targetYear) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => {
      if (a.year === null) return 1;
      if (b.year === null) return -1;
      return a.year - b.year;
    });
}

// The minimal group facts the segmentation surface buckets by free-text type. A
// null group_type = Untyped.
export type SegmentableGroup = {
  id: string;
  name: string;
  groupType: string | null;
};

export type GroupSegmentBucket = {
  segment: string;
  groups: SegmentableGroup[];
};

// Bucket groups by their free-text group_type, with Untyped groups collected
// under a visible "Untyped" bucket so they are never lost. Pure + unit-tested.
// Types sort alphabetically, but the Untyped bucket always sorts LAST so the
// typed groups read first and the to-be-tagged remainder reads as the tail.
export function bucketGroupsBySegment(
  groups: readonly SegmentableGroup[]
): GroupSegmentBucket[] {
  const buckets = new Map<string, GroupSegmentBucket>();
  for (const g of groups) {
    const segment = segmentLabel(g.groupType);
    const bucket = buckets.get(segment);
    if (bucket) bucket.groups.push(g);
    else buckets.set(segment, { segment, groups: [g] });
  }
  return [...buckets.values()].sort((a, b) => {
    if (a.segment === UNTYPED_SEGMENT) return 1;
    if (b.segment === UNTYPED_SEGMENT) return -1;
    return a.segment.localeCompare(b.segment);
  });
}
