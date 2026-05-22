import {
  SHEPHERD_CARE_STALE_DAYS,
  computeNeedsAttention,
  differenceInDaysIso,
  type ActiveShepherdCoverageAssignmentSummary,
  type OverShepherdListRow,
  type ShepherdCareDirectoryEntry,
  type ShepherdCareRecentInteractionRow,
} from "@/lib/supabase/read-models";

export type CareAttentionReason =
  | "overdue_touchpoint"
  | "needs_attention_status"
  | "no_contact_yet"
  | "stale_last_contact"
  | "no_over_shepherd"
  | "watch_status";

// Priority order: lower number = higher priority. Matches the SC.3 spec.
const REASON_PRIORITY: Record<CareAttentionReason, number> = {
  overdue_touchpoint: 1,
  needs_attention_status: 2,
  no_contact_yet: 3,
  stale_last_contact: 4,
  no_over_shepherd: 5,
  watch_status: 6,
};

export type CareAttentionItem = {
  shepherdProfileId: string;
  shepherdName: string;
  reason: CareAttentionReason;
  secondaryReasons: CareAttentionReason[];
  detail: string;
  priority: number;
  href: string;
};

export type CareCoverageBucket = {
  overShepherdId: string | null;
  overShepherdName: string;
  shepherdCount: number;
  href: string;
  isUnassigned: boolean;
};

export type CareUpcomingTouchpoint = {
  shepherdProfileId: string;
  shepherdName: string;
  dueOn: string;
  daysFromToday: number;
  relativeLabel: string;
  href: string;
};

export type CareRecentInteraction = {
  id: string;
  shepherdProfileId: string;
  shepherdName: string;
  interactionAt: string;
  interactionType: ShepherdCareRecentInteractionRow["interaction_type"];
  createdAt: string;
  href: string;
};

export type CareDashboardSummary = {
  totalActiveShepherds: number;
  needsAttention: number;
  overdueTouchpoints: number;
  notContactedRecently: number;
  noCareProfile: number;
  unassignedCoverage: number;
};

export type ShepherdCareDashboardModel = {
  summary: CareDashboardSummary;
  attentionQueue: CareAttentionItem[];
  coverageBuckets: CareCoverageBucket[];
  upcomingTouchpoints: CareUpcomingTouchpoint[];
  recentInteractions: CareRecentInteraction[];
  // False when the active-coverage read failed and the caller passed
  // assignmentsAvailable=false. In that case the builder zeros the
  // assignment-derived counts and skips the no_over_shepherd queue reason
  // so the dashboard doesn't silently misreport "everyone unassigned"
  // during a transient read failure.
  coverageAvailable: boolean;
};

export type BuildShepherdCareDashboardModelInput = {
  entries: ShepherdCareDirectoryEntry[];
  assignments: ActiveShepherdCoverageAssignmentSummary[];
  overShepherds: OverShepherdListRow[];
  recentInteractions: ShepherdCareRecentInteractionRow[];
  todayIso: string;
  // Defaults to true. Set to false when the coverage assignments read
  // errored so coverage-dependent surfaces (unassigned count, coverage
  // buckets, no_over_shepherd queue reason) can be safely suppressed.
  assignmentsAvailable?: boolean;
  limits?: {
    attention?: number;
    upcoming?: number;
    recent?: number;
    upcomingWindowDays?: number;
  };
};

const DEFAULT_LIMITS = {
  attention: 6,
  upcoming: 10,
  recent: 10,
  upcomingWindowDays: 7,
};

function shepherdHref(shepherdProfileId: string): string {
  return `/admin/shepherd-care/${shepherdProfileId}`;
}

function coverageHref(value: string): string {
  return `/admin/shepherd-care?coverage=${value}`;
}

function relativeDayLabel(daysFromToday: number): string {
  if (daysFromToday === 0) return "Due today";
  if (daysFromToday < 0) {
    const abs = Math.abs(daysFromToday);
    return abs === 1 ? "Overdue 1 day" : `Overdue ${abs} days`;
  }
  return daysFromToday === 1 ? "Due tomorrow" : `Due in ${daysFromToday} days`;
}

function detailForReason(
  reason: CareAttentionReason,
  entry: ShepherdCareDirectoryEntry,
  todayIso: string,
): string {
  const care = entry.care;
  switch (reason) {
    case "overdue_touchpoint": {
      if (care?.next_touchpoint_due) {
        const days = differenceInDaysIso(todayIso, care.next_touchpoint_due);
        return days <= 0
          ? `Touchpoint due ${care.next_touchpoint_due}`
          : days === 1
            ? "Touchpoint overdue 1 day"
            : `Touchpoint overdue ${days} days`;
      }
      return "Touchpoint overdue";
    }
    case "needs_attention_status":
      return "Marked as needs attention";
    case "no_contact_yet":
      return care === null ? "No care profile yet" : "No contact logged yet";
    case "stale_last_contact": {
      if (care?.last_contact_at) {
        const days = differenceInDaysIso(todayIso, care.last_contact_at);
        return days === 1
          ? "Last contact 1 day ago"
          : `Last contact ${days} days ago`;
      }
      return `No contact in over ${SHEPHERD_CARE_STALE_DAYS} days`;
    }
    case "no_over_shepherd":
      return "No over-shepherd assigned";
    case "watch_status":
      return "Marked as watch";
  }
}

function detectReasons(
  entry: ShepherdCareDirectoryEntry,
  assignedShepherdIds: Set<string>,
  todayIso: string,
  coverageAvailable: boolean,
): CareAttentionReason[] {
  const reasons: CareAttentionReason[] = [];
  const care = entry.care;

  if (care?.next_touchpoint_due && care.next_touchpoint_due < todayIso) {
    reasons.push("overdue_touchpoint");
  }
  if (care?.current_status === "needs_attention") {
    reasons.push("needs_attention_status");
  }
  if (care === null || care.last_contact_at === null) {
    reasons.push("no_contact_yet");
  } else if (
    differenceInDaysIso(todayIso, care.last_contact_at) > SHEPHERD_CARE_STALE_DAYS
  ) {
    reasons.push("stale_last_contact");
  }
  // Suppress no_over_shepherd entirely when coverage data is unavailable —
  // an empty assignments map is not the same as "no coach assigned" and we
  // shouldn't infer that during a transient read failure.
  if (coverageAvailable && !assignedShepherdIds.has(entry.profile.id)) {
    reasons.push("no_over_shepherd");
  }
  if (care?.current_status === "watch") {
    reasons.push("watch_status");
  }
  return reasons;
}

function buildAttentionQueue(
  entries: ShepherdCareDirectoryEntry[],
  assignedShepherdIds: Set<string>,
  todayIso: string,
  coverageAvailable: boolean,
): CareAttentionItem[] {
  const items: CareAttentionItem[] = [];
  for (const entry of entries) {
    const reasons = detectReasons(entry, assignedShepherdIds, todayIso, coverageAvailable);
    if (reasons.length === 0) continue;
    reasons.sort((a, b) => REASON_PRIORITY[a] - REASON_PRIORITY[b]);
    const [primary, ...secondary] = reasons;
    items.push({
      shepherdProfileId: entry.profile.id,
      shepherdName: entry.profile.full_name,
      reason: primary,
      secondaryReasons: secondary,
      detail: detailForReason(primary, entry, todayIso),
      priority: REASON_PRIORITY[primary],
      href: shepherdHref(entry.profile.id),
    });
  }
  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.shepherdName.localeCompare(b.shepherdName);
  });
  return items;
}

function buildSummary(
  entries: ShepherdCareDirectoryEntry[],
  assignedShepherdIds: Set<string>,
  todayIso: string,
  coverageAvailable: boolean,
): CareDashboardSummary {
  let needsAttention = 0;
  let overdueTouchpoints = 0;
  let notContactedRecently = 0;
  let noCareProfile = 0;
  let unassignedCoverage = 0;

  for (const entry of entries) {
    if (entry.needs_attention) needsAttention += 1;
    if (entry.care === null) noCareProfile += 1;
    if (entry.care?.next_touchpoint_due && entry.care.next_touchpoint_due < todayIso) {
      overdueTouchpoints += 1;
    }
    if (
      entry.care?.last_contact_at &&
      differenceInDaysIso(todayIso, entry.care.last_contact_at) > SHEPHERD_CARE_STALE_DAYS
    ) {
      notContactedRecently += 1;
    }
    if (coverageAvailable && !assignedShepherdIds.has(entry.profile.id)) {
      unassignedCoverage += 1;
    }
  }

  return {
    totalActiveShepherds: entries.length,
    needsAttention,
    overdueTouchpoints,
    notContactedRecently,
    noCareProfile,
    unassignedCoverage,
  };
}

function buildCoverageBuckets(
  overShepherds: OverShepherdListRow[],
  assignments: ActiveShepherdCoverageAssignmentSummary[],
  unassignedCount: number,
): CareCoverageBucket[] {
  const countByOverShepherdId = new Map<string, number>();
  for (const a of assignments) {
    countByOverShepherdId.set(
      a.over_shepherd_id,
      (countByOverShepherdId.get(a.over_shepherd_id) ?? 0) + 1,
    );
  }
  const active = overShepherds.filter((os) => os.active);
  const buckets: CareCoverageBucket[] = active.map((os) => ({
    overShepherdId: os.id,
    overShepherdName: os.full_name,
    shepherdCount: countByOverShepherdId.get(os.id) ?? 0,
    href: coverageHref(os.id),
    isUnassigned: false,
  }));
  buckets.push({
    overShepherdId: null,
    overShepherdName: "Unassigned",
    shepherdCount: unassignedCount,
    href: coverageHref("unassigned"),
    isUnassigned: true,
  });
  return buckets;
}

function buildUpcomingTouchpoints(
  entries: ShepherdCareDirectoryEntry[],
  todayIso: string,
  windowDays: number,
  limit: number,
): CareUpcomingTouchpoint[] {
  const items: CareUpcomingTouchpoint[] = [];
  for (const entry of entries) {
    const due = entry.care?.next_touchpoint_due;
    if (!due) continue;
    // negative = overdue, positive = upcoming. Days are floored full days.
    const daysFromToday = -differenceInDaysIso(todayIso, due);
    if (daysFromToday > windowDays) continue;
    items.push({
      shepherdProfileId: entry.profile.id,
      shepherdName: entry.profile.full_name,
      dueOn: due,
      daysFromToday,
      relativeLabel: relativeDayLabel(daysFromToday),
      href: shepherdHref(entry.profile.id),
    });
  }
  items.sort((a, b) => {
    if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
    return a.shepherdName.localeCompare(b.shepherdName);
  });
  return items.slice(0, limit);
}

function buildRecentInteractions(
  rows: ShepherdCareRecentInteractionRow[],
  limit: number,
): CareRecentInteraction[] {
  const copy = rows.slice();
  copy.sort((a, b) => {
    if (a.interaction_at !== b.interaction_at) {
      return a.interaction_at < b.interaction_at ? 1 : -1;
    }
    if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? 1 : -1;
    }
    return 0;
  });
  return copy.slice(0, limit).map((r) => ({
    id: r.id,
    shepherdProfileId: r.shepherd_profile_id,
    shepherdName: r.shepherd_full_name,
    interactionAt: r.interaction_at,
    interactionType: r.interaction_type,
    createdAt: r.created_at,
    href: shepherdHref(r.shepherd_profile_id),
  }));
}

export function buildShepherdCareDashboardModel(
  input: BuildShepherdCareDashboardModelInput,
): ShepherdCareDashboardModel {
  const limits = { ...DEFAULT_LIMITS, ...(input.limits ?? {}) };
  const coverageAvailable = input.assignmentsAvailable ?? true;
  const assignedShepherdIds = new Set<string>();
  for (const a of input.assignments) {
    assignedShepherdIds.add(a.shepherd_profile_id);
  }

  const summary = buildSummary(
    input.entries,
    assignedShepherdIds,
    input.todayIso,
    coverageAvailable,
  );
  const fullQueue = buildAttentionQueue(
    input.entries,
    assignedShepherdIds,
    input.todayIso,
    coverageAvailable,
  );

  return {
    summary,
    attentionQueue: fullQueue.slice(0, limits.attention),
    coverageBuckets: coverageAvailable
      ? buildCoverageBuckets(
          input.overShepherds,
          input.assignments,
          summary.unassignedCoverage,
        )
      : [],
    upcomingTouchpoints: buildUpcomingTouchpoints(
      input.entries,
      input.todayIso,
      limits.upcomingWindowDays,
      limits.upcoming,
    ),
    recentInteractions: buildRecentInteractions(input.recentInteractions, limits.recent),
    coverageAvailable,
  };
}

/**
 * Returns the total count of attention items (not just the visible top N) so
 * callers can render the "+N more in the directory below" footer line.
 */
export function countAllAttentionItems(
  entries: ShepherdCareDirectoryEntry[],
  assignments: ActiveShepherdCoverageAssignmentSummary[],
  todayIso: string,
  options: { coverageAvailable?: boolean } = {},
): number {
  const coverageAvailable = options.coverageAvailable ?? true;
  const ids = new Set<string>();
  for (const a of assignments) ids.add(a.shepherd_profile_id);
  let total = 0;
  for (const entry of entries) {
    if (detectReasons(entry, ids, todayIso, coverageAvailable).length > 0) {
      total += 1;
    }
  }
  return total;
}

export const __test__ = {
  REASON_PRIORITY,
  detectReasons,
};
