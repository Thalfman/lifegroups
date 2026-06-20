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
    apprentices: [...(byStage.get(stage) ?? [])].sort((a, b) =>
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

// ADR 0030 (#754): the add-apprentice form's member dropdown is the primary
// path. A sentinel option lets the admin fall back to a free-text name when the
// person isn't a member record yet, so an incomplete roster never blocks adding
// an apprentice. Kept off any real member id.
export const APPRENTICE_NAME_FALLBACK = "__not_listed__";

// How the add-apprentice form should source the apprentice's name from the
// member-dropdown selection:
//   • "member"   — a real group member is picked; the name DERIVES from the
//                  member record (no name field shown), and the link carries the
//                  member id.
//   • "fallback" — the admin explicitly chose "not listed"; a free-text name
//                  input is shown and no member is linked.
//   • "none"     — nothing chosen yet; neither a name nor a link is ready.
export type ApprenticeNameSource =
  | { mode: "member"; memberId: string; displayName: string }
  | { mode: "fallback" }
  | { mode: "none" };

// Decide, from the member-dropdown value, how the form sources the apprentice's
// name. Pure so the branching is unit-testable without the DOM. A value that
// matches a member yields the member's name; the fallback sentinel reveals the
// free-text input; anything else (the empty placeholder) is "none".
export function resolveApprenticeNameSource(
  selectedValue: string,
  members: readonly { id: string; name: string }[]
): ApprenticeNameSource {
  if (selectedValue === APPRENTICE_NAME_FALLBACK) return { mode: "fallback" };
  const member = members.find((m) => m.id === selectedValue);
  if (member) {
    return { mode: "member", memberId: member.id, displayName: member.name };
  }
  return { mode: "none" };
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

// ADR 0030 (#758): a shepherd (apprentice) matched to a pipelined group type
// as the supply side under that type — "who could lead the new group of type T."
// `readyToLead` mirrors isReadyToLead so the UI can surface Ready-to-lead first
// without re-deriving from the stage. The matcher itself (matchShepherdsToType)
// is built in #758; this is the shared shape buildPipelineView hangs under each
// pipelined type.
export type MatchedShepherd = {
  id: string;
  displayName: string;
  // The apprentice's home group (where they will lead) — shown for context.
  groupName: string;
  stage: LeaderReadinessStage;
  readyToLead: boolean;
};

// The per-apprentice facts matchShepherdsToType matches against. `groupType` is
// the apprentice's home-group type (null = Untyped), joined upstream from the
// group the apprentice belongs to. Lean so the matcher stays pure and testable
// with bare objects.
export type ShepherdMatchInput = {
  id: string;
  displayName: string;
  groupName: string;
  groupType: string | null;
  stage: LeaderReadinessStage;
};

// A case-insensitive, trim-normalized match key for a free-text group type. Kept
// consistent with `typeMatchKey` / `segmentLabel` in lib/admin/multiplication.ts
// (lowercased, trimmed) so a target type matches an apprentice's group type even
// if casing drifts. A null / empty type yields the empty string, which never
// matches a concrete pipelined type.
function shepherdTypeMatchKey(groupType: string | null): string {
  return (groupType ?? "").trim().toLowerCase();
}

// ADR 0030 (#758): match apprentices to a target group type — the supply side
// under a pipelined type. An apprentice is a candidate to lead a new group of
// type T when THEIR group's type is T (case-insensitive / trimmed). A `launched`
// apprentice already leads a group, so they are no longer available supply and
// are excluded (mirroring `apprenticeReadyBy`). Ready-to-lead apprentices
// (stage === "ready_to_lead") order first; within that, ties break by display
// name so the list is stable. Returns an empty array when nothing matches — a
// pipelined type never blocks on having a matched shepherd. Pure, no I/O.
export function matchShepherdsToType(
  apprentices: readonly ShepherdMatchInput[],
  targetType: string
): MatchedShepherd[] {
  const targetKey = shepherdTypeMatchKey(targetType);
  // A blank target can't match a concrete type; return empty rather than
  // collapsing every Untyped apprentice into it.
  if (!targetKey) return [];

  return apprentices
    .filter(
      (a) =>
        a.stage !== "launched" &&
        shepherdTypeMatchKey(a.groupType) === targetKey
    )
    .map((a) => ({
      id: a.id,
      displayName: a.displayName,
      groupName: a.groupName,
      stage: a.stage,
      readyToLead: isReadyToLead(a.stage),
    }))
    .sort((a, b) => {
      // Ready-to-lead first, then stable by display name.
      if (a.readyToLead !== b.readyToLead) return a.readyToLead ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });
}
