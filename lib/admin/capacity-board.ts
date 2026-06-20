// Capacity & Multiplication PRD §4-A / §4-C (#185): the Capacity Board — the
// replace-the-spreadsheet grid — and the join between capacity and the leader
// pipeline (R1–R4, R9). Pure functions; no I/O. Reuses effectiveCapacity(),
// capacityStatus(), and the threshold constants from lib/admin/metrics.ts so
// the Board can never drift from the rest of the admin dashboard's capacity
// view, and evaluateReadiness() from lib/admin/multiplication.ts so the 5
// criteria are shown as *context* (metCount), never a gate.

import {
  allowsOverCapacity,
  capacityStatus,
  effectiveCapacity,
  effectiveCapacityFullPct,
  effectiveCapacityWarningPct,
  isExcludedFromCapacityMetrics,
  type CapacityStatus,
  type MetricDefaults,
} from "@/lib/admin/metrics";
import {
  evaluateReadiness,
  segmentLabel,
  type ReadinessResult,
} from "@/lib/admin/multiplication";
import { isReadyToLead } from "@/lib/admin/leader-pipeline";
import {
  countActiveMembersByGroup,
  indexOverridesByGroup,
} from "@/lib/admin/group-capacity-inputs";
import type {
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
} from "@/types/database";
import type { LeaderReadinessStage } from "@/types/enums";

// Julian's words for the status ladder (R2). `unknown`/`excluded` keep their
// internal names since they aren't part of the four-rung ladder.
export const CAPACITY_STATUS_LABEL: Record<CapacityStatus, string> = {
  ok: "Room",
  warning: "Filling",
  full: "Full",
  open_by_choice: "Open by choice",
  unknown: "Target not set",
  excluded: "Excluded",
};

export type CapacityBoardApprentice = {
  id: string;
  displayName: string;
  stage: LeaderReadinessStage;
};

export type CapacityBoardRow = {
  groupId: string;
  groupName: string;
  // The group's free-text type (null = Untyped); the segment is the type name.
  groupType: string | null;
  segment: string;
  activeMemberCount: number;
  effectiveTarget: number | null;
  status: CapacityStatus;
  excluded: boolean;
  allowOverCapacity: boolean;
  // members / target, for sorting by fullness; null when target unknown.
  fillRatio: number | null;
  // At/over target — capacity status Full or Open by choice (R4).
  atOrOverTarget: boolean;
  // The group's first Ready-to-lead apprentice, if any.
  readyApprentice: CapacityBoardApprentice | null;
  // R4 "ready to multiply" badge: at/over target AND a Ready-to-lead apprentice.
  // The 5-criterion readiness is NOT a gate here (shown as context elsewhere).
  readyToMultiply: boolean;
};

type GroupInput = Pick<
  GroupsRow,
  "id" | "name" | "capacity" | "lifecycle_status" | "group_type" | "launched_on"
>;

type OverrideInput = GroupMetricSettingsRow;

function firstReadyApprentice(
  apprentices: readonly CapacityBoardApprentice[] | undefined
): CapacityBoardApprentice | null {
  if (!apprentices) return null;
  return apprentices.find((a) => isReadyToLead(a.stage)) ?? null;
}

// Build the board over all *active* groups. `overridesByGroup` and
// `membershipCounts` are keyed by group id; `apprenticesByGroup` holds the
// active apprentices per group (so the badge can find a Ready one). Rows come
// back sorted by fullness (fullest first) so "what's full" is the top of the
// grid.
export function buildCapacityBoard(args: {
  groups: readonly GroupInput[];
  overridesByGroup: ReadonlyMap<string, OverrideInput>;
  membershipCounts: ReadonlyMap<string, number>;
  metricDefaults: MetricDefaults;
  apprenticesByGroup: ReadonlyMap<string, CapacityBoardApprentice[]>;
}): CapacityBoardRow[] {
  const rows: CapacityBoardRow[] = [];
  for (const g of args.groups) {
    if (g.lifecycle_status !== "active") continue;
    const override = args.overridesByGroup.get(g.id) ?? null;
    const members = args.membershipCounts.get(g.id) ?? 0;
    const target = effectiveCapacity(
      { capacity: g.capacity },
      override,
      args.metricDefaults
    );
    const excluded = isExcludedFromCapacityMetrics(override);
    const allowOver = allowsOverCapacity(override);

    const status = capacityStatus({
      activeMemberCount: members,
      effectiveCapacity: target,
      warningPct: effectiveCapacityWarningPct(override, args.metricDefaults),
      fullPct: effectiveCapacityFullPct(args.metricDefaults),
      excluded,
      allowOverCapacity: allowOver,
    });

    const atOrOverTarget = status === "full" || status === "open_by_choice";
    const readyApprentice = firstReadyApprentice(
      args.apprenticesByGroup.get(g.id)
    );

    rows.push({
      groupId: g.id,
      groupName: g.name,
      groupType: g.group_type,
      segment: segmentLabel(g.group_type),
      activeMemberCount: members,
      effectiveTarget: target,
      status,
      excluded,
      allowOverCapacity: allowOver,
      fillRatio: target != null && target > 0 ? members / target : null,
      atOrOverTarget,
      readyApprentice,
      readyToMultiply: atOrOverTarget && readyApprentice != null,
    });
  }
  return sortBoardByFullness(rows);
}

// Fullest first; a null fill ratio (unknown target) sorts last. Ties break by
// group name so the order is stable.
export function sortBoardByFullness(
  rows: readonly CapacityBoardRow[]
): CapacityBoardRow[] {
  return [...rows].sort((a, b) => {
    if (a.fillRatio == null && b.fillRatio == null)
      return a.groupName.localeCompare(b.groupName);
    if (a.fillRatio == null) return 1;
    if (b.fillRatio == null) return -1;
    if (b.fillRatio !== a.fillRatio) return b.fillRatio - a.fillRatio;
    return a.groupName.localeCompare(b.groupName);
  });
}

export type CapacityBoardFilter = {
  segment?: string | null;
  status?: CapacityStatus | null;
};

export function filterBoard(
  rows: readonly CapacityBoardRow[],
  filter: CapacityBoardFilter
): CapacityBoardRow[] {
  return rows.filter((r) => {
    if (filter.segment && r.segment !== filter.segment) return false;
    if (filter.status && r.status !== filter.status) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Readiness map + system-suggested candidates (R9)
// ---------------------------------------------------------------------------

export type GroupReadinessInput = {
  groupId: string;
  launchedOn: string | null;
  activeMemberCount: number;
  coShepherdSince: string | null;
  shepherdWilling: boolean;
  needsSimilarStage: boolean;
};

// Compute the 5-criterion readiness for each active group so it can annotate
// (never gate) suggestions. Pure wrapper over evaluateReadiness so the read
// model can hand it bare inputs.
export function buildReadinessByGroup(
  inputs: readonly GroupReadinessInput[],
  todayIso: string
): Map<string, ReadinessResult> {
  const map = new Map<string, ReadinessResult>();
  for (const i of inputs) {
    map.set(
      i.groupId,
      evaluateReadiness(
        {
          activeMemberCount: i.activeMemberCount,
          launchedOn: i.launchedOn,
          coShepherdSince: i.coShepherdSince,
          shepherdWilling: i.shepherdWilling,
          needsSimilarStage: i.needsSimilarStage,
        },
        todayIso
      )
    );
  }
  return map;
}

export type SuggestedMultiplicationGroup = {
  groupId: string;
  groupName: string;
  segment: string;
  activeMemberCount: number;
  effectiveTarget: number | null;
  status: CapacityStatus;
  readyApprentice: CapacityBoardApprentice;
  // 5-criterion readiness shown as context ("meets 4/5"), not a gate.
  metCount: number;
  totalCount: number;
  // Whether the group already has an active multiplication candidate.
  alreadyCandidate: boolean;
};

// R9: surface a group as a system-suggested candidate when it is at/over target
// AND has a Ready-to-lead apprentice — exactly the badge predicate. The
// 5-criterion readiness ranks/annotates (metCount) rather than includes or
// excludes, per Julian's "a group does not need to meet each." Sorted by
// metCount desc (best-supported first), then group name.
export function buildMultiplicationSuggestions(
  rows: readonly CapacityBoardRow[],
  readinessByGroup: ReadonlyMap<string, ReadinessResult>,
  candidateGroupIds: ReadonlySet<string>
): SuggestedMultiplicationGroup[] {
  const suggestions: SuggestedMultiplicationGroup[] = [];
  for (const r of rows) {
    if (!r.readyToMultiply || !r.readyApprentice) continue;
    const readiness = readinessByGroup.get(r.groupId);
    suggestions.push({
      groupId: r.groupId,
      groupName: r.groupName,
      segment: r.segment,
      activeMemberCount: r.activeMemberCount,
      effectiveTarget: r.effectiveTarget,
      status: r.status,
      readyApprentice: r.readyApprentice,
      metCount: readiness?.metCount ?? 0,
      totalCount: readiness?.totalCount ?? 5,
      alreadyCandidate: candidateGroupIds.has(r.groupId),
    });
  }
  return suggestions.sort((a, b) => {
    if (b.metCount !== a.metCount) return b.metCount - a.metCount;
    return a.groupName.localeCompare(b.groupName);
  });
}

// ---------------------------------------------------------------------------
// Orchestrator: tie the read inputs to the pure builders so the Capacity Board
// page and the Multiplication Plan share one source of truth.
// ---------------------------------------------------------------------------

export type CapacityBoardModel = {
  rows: CapacityBoardRow[];
  suggestions: SuggestedMultiplicationGroup[];
  // Distinct segment labels present on the board, for the segment filter.
  segments: string[];
};

export function buildCapacityBoardModel(args: {
  groups: readonly GroupInput[];
  overrides: readonly OverrideInput[];
  memberships: readonly Pick<GroupMembershipsRow, "group_id" | "status">[];
  metricDefaults: MetricDefaults;
  apprentices: readonly {
    id: string;
    group_id: string;
    display_name: string;
    readiness_stage: LeaderReadinessStage;
  }[];
  coShepherdSinceByGroup: Readonly<Record<string, string>>;
  candidateFlagsByGroup: Readonly<
    Record<string, { shepherdWilling: boolean; needsSimilarStage: boolean }>
  >;
  candidateGroupIds: readonly string[];
  todayIso: string;
}): CapacityBoardModel {
  const overridesByGroup = indexOverridesByGroup(args.overrides);
  const membershipCounts = countActiveMembersByGroup(args.memberships);

  const apprenticesByGroup = new Map<string, CapacityBoardApprentice[]>();
  for (const a of args.apprentices) {
    const list = apprenticesByGroup.get(a.group_id) ?? [];
    list.push({
      id: a.id,
      displayName: a.display_name,
      stage: a.readiness_stage,
    });
    apprenticesByGroup.set(a.group_id, list);
  }

  const rows = buildCapacityBoard({
    groups: args.groups,
    overridesByGroup,
    membershipCounts,
    metricDefaults: args.metricDefaults,
    apprenticesByGroup,
  });

  const readinessInputs: GroupReadinessInput[] = rows.map((r) => {
    const flags = args.candidateFlagsByGroup[r.groupId];
    const launchedOn =
      args.groups.find((g) => g.id === r.groupId)?.launched_on ?? null;
    return {
      groupId: r.groupId,
      launchedOn,
      activeMemberCount: r.activeMemberCount,
      coShepherdSince: args.coShepherdSinceByGroup[r.groupId] ?? null,
      shepherdWilling: flags?.shepherdWilling ?? false,
      needsSimilarStage: flags?.needsSimilarStage ?? false,
    };
  });
  const readinessByGroup = buildReadinessByGroup(
    readinessInputs,
    args.todayIso
  );

  const suggestions = buildMultiplicationSuggestions(
    rows,
    readinessByGroup,
    new Set(args.candidateGroupIds)
  );

  const segments = [...new Set(rows.map((r) => r.segment))].sort((a, b) =>
    a.localeCompare(b)
  );

  return { rows, suggestions, segments };
}
