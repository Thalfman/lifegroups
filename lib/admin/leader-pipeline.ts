// Capacity & Multiplication PRD §3.2 / §4-B (#183): Leader Pipeline helpers.
// Pure functions, no I/O — the read model supplies the inputs, these compute
// the roll-up so they can be unit-tested with bare objects (mirroring
// lib/admin/multiplication.ts).
//
// The pipeline is the *supply side* of the forecast: every apprentice and
// their readiness stage, rolled up so "who is Ready to lead?" is a glance, and
// the groups with no apprentice yet are surfaced as the gap that blocks
// multiplication.

import type { LeaderReadinessStage } from "@/types/enums";

// Canonical stage order: Identified → In training → Ready to lead → Launched.
// Drives both the roll-up section order and stage-advance arithmetic.
export const LEADER_READINESS_STAGES: readonly LeaderReadinessStage[] = [
  "identified",
  "in_training",
  "ready_to_lead",
  "launched",
] as const;

export const STAGE_LABEL: Record<LeaderReadinessStage, string> = {
  identified: "Identified",
  in_training: "In training",
  ready_to_lead: "Ready to lead",
  launched: "Launched",
};

export function stageIndex(stage: LeaderReadinessStage): number {
  return LEADER_READINESS_STAGES.indexOf(stage);
}

// The next stage up the ladder, or null when already Launched (the top).
export function nextStage(
  stage: LeaderReadinessStage
): LeaderReadinessStage | null {
  const i = stageIndex(stage);
  if (i < 0 || i >= LEADER_READINESS_STAGES.length - 1) return null;
  return LEADER_READINESS_STAGES[i + 1];
}

export function isReadyToLead(stage: LeaderReadinessStage): boolean {
  return stage === "ready_to_lead";
}

// The per-apprentice facts the pipeline surface renders. Computed on the server
// so the client component stays presentational.
export type ApprenticeView = {
  id: string;
  groupId: string;
  groupName: string;
  displayName: string;
  memberId: string | null;
  stage: LeaderReadinessStage;
  expectedReadyOn: string | null;
  notes: string | null;
};

export type PipelineStageGroup = {
  stage: LeaderReadinessStage;
  label: string;
  apprentices: ApprenticeView[];
};

export type PipelineGroupGap = { groupId: string; groupName: string };

export type PipelineRollup = {
  // One section per stage, in canonical order, even when empty so the ladder
  // always reads the same way.
  stages: PipelineStageGroup[];
  // Active groups with no (non-archived) apprentice — the multiplication gap.
  groupsWithoutApprentice: PipelineGroupGap[];
  totalApprentices: number;
};

export type PipelineGroupRef = { id: string; name: string };

// Roll up apprentices grouped by readiness stage, and surface the active groups
// that have no apprentice yet. `apprentices` are the active (non-archived)
// records; `activeGroups` are every active group so the gap is computed against
// the whole ministry, not only groups that already have a candidate. Within a
// stage, apprentices sort by group name so the layout is stable.
export function buildPipelineRollup(
  apprentices: readonly ApprenticeView[],
  activeGroups: readonly PipelineGroupRef[]
): PipelineRollup {
  const byStage = new Map<LeaderReadinessStage, ApprenticeView[]>();
  for (const stage of LEADER_READINESS_STAGES) byStage.set(stage, []);
  const groupsWithApprentice = new Set<string>();
  for (const a of apprentices) {
    byStage.get(a.stage)?.push(a);
    groupsWithApprentice.add(a.groupId);
  }

  const stages: PipelineStageGroup[] = LEADER_READINESS_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABEL[stage],
    apprentices: (byStage.get(stage) ?? []).sort((a, b) =>
      a.groupName.localeCompare(b.groupName)
    ),
  }));

  const groupsWithoutApprentice: PipelineGroupGap[] = activeGroups
    .filter((g) => !groupsWithApprentice.has(g.id))
    .map((g) => ({ groupId: g.id, groupName: g.name }))
    .sort((a, b) => a.groupName.localeCompare(b.groupName));

  return {
    stages,
    groupsWithoutApprentice,
    totalApprentices: apprentices.length,
  };
}

// Staffing-supply predicate (PRD §3.4 / R10, used by the forecast in #186): an
// apprentice counts toward supply for a launch at `targetIso` when they are
// Ready to lead today, or are *projected* to be ready by the target date via
// their expected-ready date. A launched apprentice is no longer available
// supply (they already lead a group), so they never count.
export function apprenticeReadyBy(
  apprentice: Pick<ApprenticeView, "stage" | "expectedReadyOn">,
  targetIso: string
): boolean {
  if (apprentice.stage === "launched") return false;
  if (apprentice.stage === "ready_to_lead") return true;
  const expected = apprentice.expectedReadyOn;
  if (!expected) return false;
  // Lexicographic compare is correct for YYYY-MM-DD ISO dates.
  return expected <= targetIso;
}
