import {
  SHEPHERD_CARE_STALE_DAYS,
  computeNeedsAttention,
  differenceInDaysIso,
  type ActiveShepherdCoverageAssignmentSummary,
  type CareFollowUpDashboardRow,
  type OverShepherdListRow,
  type ShepherdCareDirectoryEntry,
  type ShepherdCareRecentInteractionRow,
} from "@/lib/supabase/read-models";
import { isFollowUpOverdue } from "@/lib/admin/shepherd-care-follow-ups";

export type CareAttentionReason =
  | "overdue_touchpoint"
  | "overdue_care_follow_up"
  | "needs_attention_status"
  | "no_contact_yet"
  | "stale_last_contact"
  | "no_over_shepherd"
  | "watch_status";

// Priority order: lower number = higher priority. Matches the SC.3 spec.
// overdue_care_follow_up ("what I owe this person, now past due") sits just
// below an overdue touchpoint and above the softer status/staleness signals.
const REASON_PRIORITY: Record<CareAttentionReason, number> = {
  overdue_touchpoint: 1,
  overdue_care_follow_up: 2,
  needs_attention_status: 3,
  no_contact_yet: 4,
  stale_last_contact: 5,
  no_over_shepherd: 6,
  watch_status: 7,
};

// Per-shepherd care follow-up rollup the dashboard derives from the
// outstanding-follow-up feed. outstanding = open + in_progress + overdue.
export type CareFollowUpShepherdStats = { overdue: number; outstanding: number };

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
  // SC.1B: total care follow-up rows that are past due and not done.
  overdueFollowUps: number;
  // SC.1B: total outstanding (open + in_progress + overdue) care follow-ups.
  outstandingFollowUps: number;
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
  // Same posture for the SC.1B outstanding-follow-up read: false means the
  // follow-up counts are unknown (not zero) and the overdue_care_follow_up
  // queue reason is suppressed, so the dashboard doesn't report a false 0.
  followUpsAvailable: boolean;
};

export type BuildShepherdCareDashboardModelInput = {
  entries: ShepherdCareDirectoryEntry[];
  assignments: ActiveShepherdCoverageAssignmentSummary[];
  overShepherds: OverShepherdListRow[];
  recentInteractions: ShepherdCareRecentInteractionRow[];
  // SC.1B: outstanding (not-done) care follow-ups across all profiles, used
  // to surface overdue/open tasks per shepherd. Defaults to none so existing
  // callers/tests keep working.
  careFollowUps?: CareFollowUpDashboardRow[];
  // Defaults to true. Set to false when the outstanding-follow-up read
  // errored so the follow-up-derived counts and the overdue_care_follow_up
  // queue reason are suppressed rather than reporting a misleading 0.
  careFollowUpsAvailable?: boolean;
  todayIso: string;
  // Defaults to true. Set to false when the coverage assignments read
  // errored so coverage-dependent surfaces (unassigned count, coverage
  // buckets, no_over_shepherd queue reason) can be safely suppressed.
  assignmentsAvailable?: boolean;
  // Julian P1: configured stale-contact window. Defaults to the documented
  // 60-day baseline when omitted so existing callers/tests keep working.
  staleDays?: number;
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

// Join the outstanding-follow-up feed (keyed by care_profile_id) to the
// directory entries (keyed by shepherd_profile_id, with entry.care.id being
// the care_profile_id) and roll up per-shepherd overdue/outstanding counts.
// Follow-ups whose care profile isn't in the visible directory (e.g. a
// deactivated shepherd) are skipped so the dashboard stays consistent with
// the rows it renders.
function buildFollowUpStats(
  entries: ShepherdCareDirectoryEntry[],
  careFollowUps: CareFollowUpDashboardRow[],
  todayIso: string,
): {
  byShepherdId: Map<string, CareFollowUpShepherdStats>;
  totalOverdue: number;
  totalOutstanding: number;
} {
  const shepherdIdByCareProfileId = new Map<string, string>();
  for (const entry of entries) {
    if (entry.care) shepherdIdByCareProfileId.set(entry.care.id, entry.profile.id);
  }

  const byShepherdId = new Map<string, CareFollowUpShepherdStats>();
  let totalOverdue = 0;
  let totalOutstanding = 0;
  for (const fu of careFollowUps) {
    if (fu.status === "done") continue; // feed is not-done, but be defensive
    const shepherdId = shepherdIdByCareProfileId.get(fu.care_profile_id);
    if (shepherdId === undefined) continue;
    const stats = byShepherdId.get(shepherdId) ?? { overdue: 0, outstanding: 0 };
    stats.outstanding += 1;
    totalOutstanding += 1;
    if (isFollowUpOverdue(fu, todayIso)) {
      stats.overdue += 1;
      totalOverdue += 1;
    }
    byShepherdId.set(shepherdId, stats);
  }
  return { byShepherdId, totalOverdue, totalOutstanding };
}

function detailForReason(
  reason: CareAttentionReason,
  entry: ShepherdCareDirectoryEntry,
  todayIso: string,
  staleDays: number,
  followUpStats: Map<string, CareFollowUpShepherdStats>,
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
    case "overdue_care_follow_up": {
      const overdue = followUpStats.get(entry.profile.id)?.overdue ?? 0;
      return overdue === 1
        ? "1 follow-up overdue"
        : `${overdue} follow-ups overdue`;
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
      return `No contact in over ${staleDays} days`;
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
  staleDays: number,
  followUpStats: Map<string, CareFollowUpShepherdStats>,
): CareAttentionReason[] {
  const reasons: CareAttentionReason[] = [];
  const care = entry.care;

  if (care?.next_touchpoint_due && care.next_touchpoint_due < todayIso) {
    reasons.push("overdue_touchpoint");
  }
  if ((followUpStats.get(entry.profile.id)?.overdue ?? 0) > 0) {
    reasons.push("overdue_care_follow_up");
  }
  if (care?.current_status === "needs_attention") {
    reasons.push("needs_attention_status");
  }
  if (care === null || care.last_contact_at === null) {
    reasons.push("no_contact_yet");
  } else if (
    differenceInDaysIso(todayIso, care.last_contact_at) > staleDays
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
  staleDays: number,
  followUpStats: Map<string, CareFollowUpShepherdStats>,
): CareAttentionItem[] {
  const items: CareAttentionItem[] = [];
  for (const entry of entries) {
    const reasons = detectReasons(
      entry,
      assignedShepherdIds,
      todayIso,
      coverageAvailable,
      staleDays,
      followUpStats,
    );
    if (reasons.length === 0) continue;
    reasons.sort((a, b) => REASON_PRIORITY[a] - REASON_PRIORITY[b]);
    const [primary, ...secondary] = reasons;
    items.push({
      shepherdProfileId: entry.profile.id,
      shepherdName: entry.profile.full_name,
      reason: primary,
      secondaryReasons: secondary,
      detail: detailForReason(primary, entry, todayIso, staleDays, followUpStats),
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
  staleDays: number,
  followUpTotals: { overdue: number; outstanding: number },
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
      differenceInDaysIso(todayIso, entry.care.last_contact_at) > staleDays
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
    overdueFollowUps: followUpTotals.overdue,
    outstandingFollowUps: followUpTotals.outstanding,
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
  const staleDays = input.staleDays ?? SHEPHERD_CARE_STALE_DAYS;
  const assignedShepherdIds = new Set<string>();
  for (const a of input.assignments) {
    assignedShepherdIds.add(a.shepherd_profile_id);
  }

  const followUpsAvailable = input.careFollowUpsAvailable ?? true;
  // When the follow-up read is unavailable, suppress all follow-up-derived
  // output (empty stats + zero totals) so the dashboard reports "unknown"
  // via followUpsAvailable rather than a misleading 0 — mirroring the
  // coverageAvailable handling above.
  const followUps = followUpsAvailable
    ? buildFollowUpStats(input.entries, input.careFollowUps ?? [], input.todayIso)
    : { byShepherdId: new Map<string, CareFollowUpShepherdStats>(), totalOverdue: 0, totalOutstanding: 0 };

  const summary = buildSummary(
    input.entries,
    assignedShepherdIds,
    input.todayIso,
    coverageAvailable,
    staleDays,
    { overdue: followUps.totalOverdue, outstanding: followUps.totalOutstanding },
  );
  const fullQueue = buildAttentionQueue(
    input.entries,
    assignedShepherdIds,
    input.todayIso,
    coverageAvailable,
    staleDays,
    followUps.byShepherdId,
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
    followUpsAvailable,
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
  options: {
    coverageAvailable?: boolean;
    staleDays?: number;
    careFollowUps?: CareFollowUpDashboardRow[];
  } = {},
): number {
  const coverageAvailable = options.coverageAvailable ?? true;
  const staleDays = options.staleDays ?? SHEPHERD_CARE_STALE_DAYS;
  const ids = new Set<string>();
  for (const a of assignments) ids.add(a.shepherd_profile_id);
  const followUpStats = buildFollowUpStats(
    entries,
    options.careFollowUps ?? [],
    todayIso,
  ).byShepherdId;
  let total = 0;
  for (const entry of entries) {
    if (
      detectReasons(entry, ids, todayIso, coverageAvailable, staleDays, followUpStats)
        .length > 0
    ) {
      total += 1;
    }
  }
  return total;
}

export const __test__ = {
  REASON_PRIORITY,
  detectReasons,
};
