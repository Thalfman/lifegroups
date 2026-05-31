// Julian P4: multiplication readiness + segmentation helpers. Pure functions,
// no I/O — the read model supplies the inputs, these compute the rest so they
// can be unit-tested with bare objects.
//
// Readiness criteria are Julian's, from LG_MULTIPLICATION_PLAN_2026.md and
// systems-conversation answer 10:
//   * 12+ members in the group
//   * 3+ years meeting as a group (from groups.launched_on)
//   * a co-shepherd serving 1+ year (from group_leaders.assigned_at)
//   * the shepherd is willing to multiply (manual flag)
//   * there is a need for a similar-stage group (manual flag)
// "A group does not need to meet each of these criteria" — so we report each
// one independently plus a met-count, rather than a single pass/fail.

import type {
  GroupAudienceCategory,
  GroupLifeStage,
  LeaderReadinessStage,
  MultiplicationCandidateStatus,
  MultiplicationMeetingTime,
} from "@/types/enums";
import type { MultiplicationCandidateEntry } from "@/lib/supabase/read-models";

export const MULTIPLICATION_MIN_MEMBERS = 12;
export const MULTIPLICATION_MIN_YEARS_ACTIVE = 3;
export const MULTIPLICATION_MIN_CO_SHEPHERD_YEARS = 1;

export type MultiplicationCriterion =
  | "enough_members"
  | "established_long_enough"
  | "co_shepherd_tenured"
  | "shepherd_willing"
  | "needs_similar_stage";

export type ReadinessInput = {
  activeMemberCount: number;
  // groups.launched_on (YYYY-MM-DD) or null when unknown.
  launchedOn: string | null;
  // Earliest active co_leader assignment date (YYYY-MM-DD) or null when the
  // group has no co-leader.
  coShepherdSince: string | null;
  shepherdWilling: boolean;
  needsSimilarStage: boolean;
};

export type ReadinessResult = {
  criteria: Record<MultiplicationCriterion, boolean>;
  metCount: number;
  totalCount: number;
};

// Whole years between two YYYY-MM-DD dates (anniversary-aware), or null when
// either input is missing/malformed. Used for "3+ years" and "co-shepherd 1+
// year". Exported for testing.
export function wholeYearsBetween(
  fromIso: string | null,
  toIso: string
): number | null {
  if (!fromIso) return null;
  const from = parseIsoParts(fromIso);
  const to = parseIsoParts(toIso);
  if (!from || !to) return null;
  let years = to.y - from.y;
  // Subtract a year when `to` hasn't reached the anniversary yet.
  if (to.m < from.m || (to.m === from.m && to.d < from.d)) years -= 1;
  return years;
}

function parseIsoParts(
  iso: string
): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function evaluateReadiness(
  input: ReadinessInput,
  todayIso: string
): ReadinessResult {
  const yearsActive = wholeYearsBetween(input.launchedOn, todayIso);
  const coShepherdYears = wholeYearsBetween(input.coShepherdSince, todayIso);

  const criteria: Record<MultiplicationCriterion, boolean> = {
    enough_members: input.activeMemberCount >= MULTIPLICATION_MIN_MEMBERS,
    established_long_enough:
      yearsActive != null && yearsActive >= MULTIPLICATION_MIN_YEARS_ACTIVE,
    co_shepherd_tenured:
      coShepherdYears != null &&
      coShepherdYears >= MULTIPLICATION_MIN_CO_SHEPHERD_YEARS,
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
  co_shepherd_tenured: "Co-Leader 1+ yr",
  shepherd_willing: "Leader willing",
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

export const AUDIENCE_LABEL: Record<GroupAudienceCategory, string> = {
  men: "Men",
  women: "Women",
  mixed: "Mixed / couples",
};

export const LIFE_STAGE_LABEL: Record<GroupLifeStage, string> = {
  young_professionals: "Young professionals",
  young_families: "Young families",
  families_with_kids: "Families with kids/teens",
  families_with_adult_kids: "Families with adult kids",
  retirement: "Retirement",
  multi_generational: "Multi-generational",
  spanish_speaking: "Spanish speaking",
};

// A human-readable segment key for grouping candidates: audience × life stage.
export function segmentLabel(
  audience: GroupAudienceCategory | null,
  lifeStage: GroupLifeStage | null
): string {
  const a = audience ? AUDIENCE_LABEL[audience] : "Unsegmented";
  const s = lifeStage ? LIFE_STAGE_LABEL[lifeStage] : null;
  return s ? `${a} · ${s}` : a;
}

// The per-candidate facts the planner surface renders: the group identity, the
// editable planning fields, and the derived readiness. Computed once on the
// server so the client component stays presentational.
export type CandidateView = {
  candidateId: string;
  groupId: string;
  groupName: string;
  segment: string;
  targetYear: number | null;
  status: MultiplicationCandidateStatus;
  shepherdWilling: boolean;
  needsSimilarStage: boolean;
  notes: string | null;
  successorDesignate: string | null;
  meetingTime: MultiplicationMeetingTime | null;
  activeMemberCount: number;
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

// Julian #145: turn the read model's enriched candidate entries into the
// segmented, readiness-scored view the planner renders. Grouped by audience ×
// life stage (the Doc's gender-category × age-bracket shape) and sorted by
// segment label so the layout is stable and scannable. Pure — readiness is
// computed against the supplied `todayIso`.
export function buildPlannerSegments(
  entries: MultiplicationCandidateEntry[],
  todayIso: string
): SegmentGroup[] {
  const segmentMap = new Map<string, SegmentGroup>();
  for (const entry of entries) {
    const segment = segmentLabel(
      entry.group?.audience_category ?? null,
      entry.group?.life_stage ?? null
    );
    const view: CandidateView = {
      candidateId: entry.candidate.id,
      groupId: entry.candidate.group_id,
      groupName: entry.group?.name ?? "Unknown group",
      segment,
      targetYear: entry.candidate.target_year,
      status: entry.candidate.status,
      shepherdWilling: entry.candidate.shepherd_willing,
      needsSimilarStage: entry.candidate.needs_similar_stage,
      notes: entry.candidate.notes,
      successorDesignate: entry.candidate.successor_designate,
      meetingTime: entry.candidate.meeting_time,
      activeMemberCount: entry.activeMemberCount,
      leaderPipelineId: entry.candidate.leader_pipeline_id,
      linkedApprentice: entry.linkedApprentice,
      readiness: evaluateReadiness(
        {
          activeMemberCount: entry.activeMemberCount,
          launchedOn: entry.group?.launched_on ?? null,
          coShepherdSince: entry.coShepherdSince,
          shepherdWilling: entry.candidate.shepherd_willing,
          needsSimilarStage: entry.candidate.needs_similar_stage,
        },
        todayIso
      ),
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
