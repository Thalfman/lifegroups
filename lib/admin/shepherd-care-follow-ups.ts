// Phase SC.1B — pure helpers for the care follow-up task list. No DB, no I/O.
// This is the simple, stable interface the RPC (status-transition rule),
// the SC.3 dashboard (overdue/open bucketing + counts), and the UI (urgency
// ordering, overdue highlight) all consume from one source of truth.
//
// Privacy note: these helpers operate on the workflow fields only (status,
// due_date) and never touch title / notes bodies, so nothing here can leak
// pastoral content.

import type { ShepherdCareFollowUpStatus } from "@/types/enums";

export const SHEPHERD_CARE_FOLLOW_UP_STATUSES: readonly ShepherdCareFollowUpStatus[] = [
  "open",
  "in_progress",
  "done",
];

export function isShepherdCareFollowUpStatus(
  value: unknown,
): value is ShepherdCareFollowUpStatus {
  return (
    typeof value === "string" &&
    (SHEPHERD_CARE_FOLLOW_UP_STATUSES as readonly string[]).includes(value)
  );
}

// Minimal shape the workflow helpers need. Both the read-model row and the
// dashboard feed row are structurally assignable to this.
export type CareFollowUpLike = {
  status: ShepherdCareFollowUpStatus;
  due_date: string | null;
};

export type CareFollowUpBucket = "overdue" | "open" | "in_progress" | "done";

/**
 * Status-transition rule (authoritative copy mirrored by the SQL RPC): any of
 * open / in_progress / done may move to any OTHER state. A same-state move is
 * rejected as a no-op so the workflow and audit trail only record real
 * progress. Reopening from done is therefore allowed (done -> open /
 * in_progress) and, per {@link followUpCompletionEffect}, clears completed_at.
 */
export function canTransitionFollowUpStatus(
  from: ShepherdCareFollowUpStatus,
  to: ShepherdCareFollowUpStatus,
): boolean {
  if (!isShepherdCareFollowUpStatus(from) || !isShepherdCareFollowUpStatus(to)) {
    return false;
  }
  return from !== to;
}

/**
 * Whether a transition INTO `to` should set or clear completed_at.
 * completed_at is owned by the done state: set on entry, cleared on exit.
 */
export function followUpCompletionEffect(
  to: ShepherdCareFollowUpStatus,
): "set" | "clear" {
  return to === "done" ? "set" : "clear";
}

/**
 * A follow-up is overdue when it has a due date in the past and is not yet
 * done. "Past" uses strict `<` against the caller's UTC `todayIso`, so a
 * task due today is not yet overdue — matching the next-touchpoint overdue
 * convention in the care dashboard.
 */
export function isFollowUpOverdue(
  followUp: CareFollowUpLike,
  todayIso: string,
): boolean {
  if (followUp.status === "done") return false;
  if (followUp.due_date === null) return false;
  return followUp.due_date < todayIso;
}

export function bucketFollowUp(
  followUp: CareFollowUpLike,
  todayIso: string,
): CareFollowUpBucket {
  if (followUp.status === "done") return "done";
  if (isFollowUpOverdue(followUp, todayIso)) return "overdue";
  return followUp.status; // "open" | "in_progress"
}

export type CareFollowUpCounts = {
  open: number;
  inProgress: number;
  overdue: number;
  done: number;
  // open + in_progress that are NOT overdue plus overdue — i.e. everything
  // still outstanding. Useful as the single "what I owe" signal.
  outstanding: number;
};

export function summarizeFollowUps(
  followUps: readonly CareFollowUpLike[],
  todayIso: string,
): CareFollowUpCounts {
  const counts: CareFollowUpCounts = {
    open: 0,
    inProgress: 0,
    overdue: 0,
    done: 0,
    outstanding: 0,
  };
  for (const f of followUps) {
    const bucket = bucketFollowUp(f, todayIso);
    switch (bucket) {
      case "open":
        counts.open += 1;
        break;
      case "in_progress":
        counts.inProgress += 1;
        break;
      case "overdue":
        counts.overdue += 1;
        break;
      case "done":
        counts.done += 1;
        break;
    }
  }
  counts.outstanding = counts.open + counts.inProgress + counts.overdue;
  return counts;
}

/**
 * Urgency comparator: overdue first, then soonest due date, then no-due-date,
 * with done items sinking to the bottom. Sorting non-done rows by `due_date`
 * ascending (nulls last) naturally puts the most-overdue task on top, then
 * the soonest upcoming, satisfying "overdue first, then soonest due date".
 */
export function compareFollowUpUrgency(
  a: CareFollowUpLike,
  b: CareFollowUpLike,
  todayIso: string,
): number {
  const aDone = a.status === "done";
  const bDone = b.status === "done";
  if (aDone !== bDone) return aDone ? 1 : -1;

  if (!aDone) {
    const aOverdue = isFollowUpOverdue(a, todayIso);
    const bOverdue = isFollowUpOverdue(b, todayIso);
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
  }

  // Due date ascending, nulls last (within the done / not-done partition).
  if (a.due_date === null && b.due_date === null) return 0;
  if (a.due_date === null) return 1;
  if (b.due_date === null) return -1;
  if (a.due_date === b.due_date) return 0;
  return a.due_date < b.due_date ? -1 : 1;
}

/**
 * Returns a new array sorted by urgency. Stable for equal-urgency rows so the
 * caller's incoming order (e.g. created_at) breaks ties predictably.
 */
export function sortFollowUpsByUrgency<T extends CareFollowUpLike>(
  followUps: readonly T[],
  todayIso: string,
): T[] {
  return followUps
    .map((value, index) => ({ value, index }))
    .sort((a, b) => {
      const byUrgency = compareFollowUpUrgency(a.value, b.value, todayIso);
      return byUrgency !== 0 ? byUrgency : a.index - b.index;
    })
    .map((entry) => entry.value);
}
