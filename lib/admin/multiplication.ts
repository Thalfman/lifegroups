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
  LeaderReadinessStage,
  MultiplicationCandidateStatus,
  MultiplicationMeetingTime,
} from "@/types/enums";
import type { MultiplicationCandidateEntry } from "@/lib/supabase/read-models";
import { AUDIENCE_LABEL } from "@/lib/admin/audience";

// Re-exported from the canonical Audience leaf so existing importers keep working.
export { AUDIENCE_LABEL };

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

// #398: the visible bucket for groups that carry no category (category_id null)
// — and the fallback when a group has no audience either. Untagged groups are
// never dropped from the segmentation surface; they collect here so an admin can
// see and tag them.
export const UNCATEGORIZED_SEGMENT = "Uncategorized";

// #398: a human-readable segment key for grouping by cell — audience × category
// label (the free-form catalog label, e.g. "20-30s"). Replaces the old audience
// × life_stage key. A group with no category resolves to the Uncategorized
// bucket; a group with a category but no audience still reads its label.
export function segmentLabel(
  audience: GroupAudienceCategory | null,
  categoryLabel: string | null
): string {
  const label = categoryLabel?.trim() || null;
  // A cell is audience × category. Without a category there is no cell, so an
  // untagged group — including every existing group after the no-backfill
  // migration — buckets under Uncategorized regardless of its audience, rather
  // than masquerading as an audience-only segment. A label without an audience
  // still reads, landing in the Uncategorized family.
  if (!label) return UNCATEGORIZED_SEGMENT;
  const a = audience ? AUDIENCE_LABEL[audience] : UNCATEGORIZED_SEGMENT;
  return `${a} · ${label}`;
}

// ADR 0022: a stable DOM anchor id for a segment, so the Readiness grid can
// deep-link a cell to the matching segment block in the Plan tab
// (/admin/multiply?tab=plan#<id>). Derived from segmentLabel so the grid and the
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
  // Type-first: the multiplying group, or null for a type-only watch. The edit
  // form pre-selects the type from `audience`/`categoryId` and the group from
  // `groupId`.
  groupId: string | null;
  groupName: string;
  audience: GroupAudienceCategory | null;
  categoryId: string | null;
  // The candidate's own category label (for re-displaying its type in the edit
  // form even when the loaded type options omit it). null = Uncategorized.
  categoryLabel: string | null;
  segment: string;
  targetYear: number | null;
  status: MultiplicationCandidateStatus;
  shepherdWilling: boolean;
  needsSimilarStage: boolean;
  notes: string | null;
  successorDesignate: string | null;
  meetingTime: MultiplicationMeetingTime | null;
  // The in-app roster count (active group_memberships).
  activeMemberCount: number;
  // ADR 0022: Julian's manually-entered headcount, or null when unset.
  manualMemberCount: number | null;
  // The EFFECTIVE count the planner displays and the "12+ members" criterion
  // reads: the manual value when Julian has entered one, else the roster count.
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
// segmented, readiness-scored view the planner renders. Grouped by cell —
// audience × category label (#398 replaces the old life_stage axis) — and sorted
// by segment label so the layout is stable and scannable. Untagged groups bucket
// under "Uncategorized" (segmentLabel) so they are never dropped. Pure —
// readiness is computed against the supplied `todayIso`.
export function buildPlannerSegments(
  entries: MultiplicationCandidateEntry[],
  todayIso: string
): SegmentGroup[] {
  const segmentMap = new Map<string, SegmentGroup>();
  for (const entry of entries) {
    // Type-first: bucket by the candidate's OWN cell (audience × category),
    // falling back to the attached group's for legacy rows whose type columns
    // weren't backfilled (e.g. a group that was Uncategorized).
    const audience =
      entry.candidate.audience_category ??
      entry.group?.audience_category ??
      null;
    const categoryLabel =
      entry.candidateCategoryLabel ?? entry.group?.category_label ?? null;
    const segment = segmentLabel(audience, categoryLabel);
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
        (entry.candidate.group_id
          ? "Unknown group"
          : "(type only — no group yet)"),
      audience,
      categoryId: entry.candidate.category_id,
      categoryLabel,
      segment,
      targetYear: entry.candidate.target_year,
      status: entry.candidate.status,
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
      readiness: evaluateReadiness(
        {
          activeMemberCount: memberCount,
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

// #398: the minimal group facts the segmentation surface buckets by cell. A
// group carries an audience (top type) and a free-form category label (resolved
// from category_id → group_categories.label). A null label = Uncategorized.
export type SegmentableGroup = {
  id: string;
  name: string;
  audienceCategory: GroupAudienceCategory | null;
  categoryLabel: string | null;
};

export type GroupSegmentBucket = {
  segment: string;
  groups: SegmentableGroup[];
};

// #398: bucket groups into cells (audience × category label) for the
// segmentation surface, with untagged groups collected under a visible
// "Uncategorized" bucket so they are never lost. Pure + unit-tested. Cells sort
// alphabetically, but the Uncategorized bucket always sorts LAST so the cells an
// admin has built read first and the to-be-tagged remainder reads as the tail.
export function bucketGroupsBySegment(
  groups: readonly SegmentableGroup[]
): GroupSegmentBucket[] {
  const buckets = new Map<string, GroupSegmentBucket>();
  for (const g of groups) {
    const segment = segmentLabel(g.audienceCategory, g.categoryLabel);
    const bucket = buckets.get(segment);
    if (bucket) bucket.groups.push(g);
    else buckets.set(segment, { segment, groups: [g] });
  }
  return [...buckets.values()].sort((a, b) => {
    if (a.segment === UNCATEGORIZED_SEGMENT) return 1;
    if (b.segment === UNCATEGORIZED_SEGMENT) return -1;
    return a.segment.localeCompare(b.segment);
  });
}
