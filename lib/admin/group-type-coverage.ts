// Per-group-type coverage — the pure "have X of Y" resolver for the free-text
// group-type model. No I/O, no Supabase. Replaces the per-cell (Audience ×
// Category) coverage: a group's segmentation is now a single free-text
// group_type string, so coverage rolls up by that name.
//
//   X (have)   = groups of the type whose lifecycle_status ∈ {active,
//                launching_soon} ("active + actively-launching"). Other states
//                (planned, closed, …) do NOT count.
//   Y (target) = the type's configured target_count (0 when no config row).

import type { GroupLifecycleStatus } from "@/types/enums";

// The lifecycle states that count toward coverage X — a live group plus one
// actively launching. Named in one place so the rule is testable.
export const COVERAGE_LIFECYCLE_STATES: ReadonlySet<GroupLifecycleStatus> =
  new Set<GroupLifecycleStatus>(["active", "launching_soon"]);

export function countsTowardCoverage(status: GroupLifecycleStatus): boolean {
  return COVERAGE_LIFECYCLE_STATES.has(status);
}

// One group's contribution: its free-text type (null = Untyped) + lifecycle.
export type CoverageGroupInput = {
  groupType: string | null;
  lifecycleStatus: GroupLifecycleStatus;
};

// A type's configured target (and whether a config row exists). target 0 +
// configured false = the type is listed/seen but never tuned.
export type GroupTypeConfigInput = {
  groupType: string;
  targetCount: number;
};

// One group type's coverage row.
export type GroupTypeCoverage = {
  groupType: string;
  label: string;
  have: number;
  target: number;
  // True when the type has a saved config row (target/readiness).
  configured: boolean;
  gap: number;
};

function norm(value: string): string {
  return value.trim().toLowerCase();
}

// Build per-type coverage from the canonical type list + the group rows + the
// per-type config rows. The row set is the UNION of: the canonical list, every
// type that has a config row, and every type actually present on a group — so a
// type lingering on groups after being removed from the list still shows (with
// its real `have`). Matching is case-insensitive on the trimmed name; the first
// spelling seen wins as the display label. Untyped groups are NOT a row here
// (the caller can surface an Untyped bucket separately if wanted).
export function buildGroupTypeCoverage(args: {
  types: readonly string[];
  groups: readonly CoverageGroupInput[];
  configs: readonly GroupTypeConfigInput[];
}): GroupTypeCoverage[] {
  const order: string[] = [];
  const labelByKey = new Map<string, string>();
  const targetByKey = new Map<string, number>();
  const configuredKeys = new Set<string>();
  const haveByKey = new Map<string, number>();

  const see = (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return null;
    const key = norm(trimmed);
    if (!labelByKey.has(key)) {
      labelByKey.set(key, trimmed);
      order.push(key);
    }
    return key;
  };

  // 1. The canonical list defines the display order + labels.
  for (const name of args.types) see(name);

  // 2. Config rows seed targets + the configured flag (and surface unlisted types).
  for (const config of args.configs) {
    const key = see(config.groupType);
    if (key === null) continue;
    targetByKey.set(key, Math.max(0, config.targetCount));
    configuredKeys.add(key);
  }

  // 3. Tally have from the group rows (and surface any unlisted-yet-used types).
  for (const group of args.groups) {
    if (group.groupType === null) continue;
    if (!countsTowardCoverage(group.lifecycleStatus)) {
      // Still surface the type as a row (have 0) even if its only groups are
      // closed/paused, so an admin can see + tune it.
      see(group.groupType);
      continue;
    }
    const key = see(group.groupType);
    if (key === null) continue;
    haveByKey.set(key, (haveByKey.get(key) ?? 0) + 1);
  }

  return order.map((key) => {
    const have = haveByKey.get(key) ?? 0;
    const target = targetByKey.get(key) ?? 0;
    return {
      groupType: labelByKey.get(key) ?? "",
      label: labelByKey.get(key) ?? "",
      have,
      target,
      configured: configuredKeys.has(key),
      gap: Math.max(0, target - have),
    };
  });
}

export function sortByLargestShortfall<
  T extends { gap: number; label: string },
>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => b.gap - a.gap || a.label.localeCompare(b.label)
  );
}

// The Home Multiply-overview summary, derived from per-type coverage so Home and
// the deep Multiply surface never disagree. A type "counts" toward the overview
// only when it has a positive target (an untargeted type is tracking-only); it is
// "met" when its have reaches that target.
export function buildMultiplyHomeSummary(rows: readonly GroupTypeCoverage[]): {
  readyCells: number;
  activeCells: number;
} {
  const targeted = rows.filter((r) => r.target > 0);
  return {
    activeCells: targeted.length,
    readyCells: targeted.filter((r) => r.have >= r.target).length,
  };
}
