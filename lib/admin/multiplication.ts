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
  MultiplicationCandidateStatus,
} from "@/types/enums";

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
export function wholeYearsBetween(fromIso: string | null, toIso: string): number | null {
  if (!fromIso) return null;
  const from = parseIsoParts(fromIso);
  const to = parseIsoParts(toIso);
  if (!from || !to) return null;
  let years = to.y - from.y;
  // Subtract a year when `to` hasn't reached the anniversary yet.
  if (to.m < from.m || (to.m === from.m && to.d < from.d)) years -= 1;
  return years;
}

function parseIsoParts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function evaluateReadiness(input: ReadinessInput, todayIso: string): ReadinessResult {
  const yearsActive = wholeYearsBetween(input.launchedOn, todayIso);
  const coShepherdYears = wholeYearsBetween(input.coShepherdSince, todayIso);

  const criteria: Record<MultiplicationCriterion, boolean> = {
    enough_members: input.activeMemberCount >= MULTIPLICATION_MIN_MEMBERS,
    established_long_enough:
      yearsActive != null && yearsActive >= MULTIPLICATION_MIN_YEARS_ACTIVE,
    co_shepherd_tenured:
      coShepherdYears != null && coShepherdYears >= MULTIPLICATION_MIN_CO_SHEPHERD_YEARS,
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
  co_shepherd_tenured: "Co-shepherd 1+ yr",
  shepherd_willing: "Shepherd willing",
  needs_similar_stage: "Need for similar group",
};

export const CANDIDATE_STATUS_LABEL: Record<MultiplicationCandidateStatus, string> = {
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
  lifeStage: GroupLifeStage | null,
): string {
  const a = audience ? AUDIENCE_LABEL[audience] : "Unsegmented";
  const s = lifeStage ? LIFE_STAGE_LABEL[lifeStage] : null;
  return s ? `${a} · ${s}` : a;
}
