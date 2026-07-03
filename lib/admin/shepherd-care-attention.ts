// The single source of truth for "does this Leader need attention, and why".
//
// This predicate used to live in two places that could drift apart: a boolean
// `computeNeedsAttention` in lib/supabase/shepherd-care-directory-reads.ts (the directory chip +
// filter) and a richer `detectReasons` in lib/admin/shepherd-care-dashboard.ts
// (the triage queue). The boolean is exactly the chip-worthy subset of the
// reasons, so deriving one from the other means the count, the filter, and the
// queue can never disagree — the hazard the dashboard code warned about in a
// comment.
//
// Pure module, no I/O: callers resolve the per-tier staleness window, the
// overdue-follow-up flag, and the no-over-shepherd flag, then hand us bare
// values. Keeps the `shepherd_care` vocabulary per ADR-0008 even though the UI
// says "Leader". The only import is the shared day-diff primitive from
// read-core (which imports nothing but a type, so this stays acyclic).

import { differenceInDaysIso } from "@/lib/supabase/read-core";
import { laterIso } from "@/lib/admin/care-temporal";
import type { ShepherdCareProfilesRow } from "@/types/database";

// Only the care fields the attention predicate reads. ShepherdCareDirectorySummary
// (shepherd-care-directory-reads) is structurally assignable to this.
export type CareAttentionRow = Pick<
  ShepherdCareProfilesRow,
  "current_status" | "last_contact_at" | "next_touchpoint_due"
>;

export type CareAttentionReason =
  | "overdue_touchpoint"
  | "overdue_care_follow_up"
  | "concern_status"
  | "needs_follow_up_status"
  | "no_contact_yet"
  | "stale_last_contact"
  | "no_over_shepherd"
  | "needs_encouragement_status";

// Priority order: lower number = higher priority. Matches the SC.3 spec.
// overdue_care_follow_up ("what I owe this person, now past due") sits just
// below an overdue touchpoint and above the softer status/staleness signals.
// The status-derived reasons rank by Julian's severity ladder: `concern`
// (most severe) above `needs_follow_up`, with `needs_encouragement` as the
// softest nudge at the bottom. `inactive` is a lifecycle state, not a
// severity, so it does not raise an attention reason.
export const REASON_PRIORITY: Record<CareAttentionReason, number> = {
  overdue_touchpoint: 1,
  overdue_care_follow_up: 2,
  concern_status: 3,
  needs_follow_up_status: 4,
  no_contact_yet: 5,
  stale_last_contact: 6,
  no_over_shepherd: 7,
  needs_encouragement_status: 8,
};

// The reasons that count toward the headline "Needs attention" chip + the
// directory filter. The three left out are queue-only: an overdue care
// follow-up and a missing over-shepherd are coverage/task signals rather than
// a care-status problem on the person, and needs_encouragement is the softest
// nudge. (read-time `computeNeedsAttention` has no follow-up/coverage inputs,
// so those reasons can't arise there anyway — this keeps the two paths exactly
// aligned.)
export const ATTENTION_CHIP_REASONS: ReadonlySet<CareAttentionReason> = new Set(
  [
    "overdue_touchpoint",
    "concern_status",
    "needs_follow_up_status",
    "no_contact_yet",
    "stale_last_contact",
  ]
);

export type DetectCareReasonsContext = {
  todayIso: string;
  // The shepherd's resolved per-tier staleness window, in days.
  staleDays: number;
  // Whether the shepherd has at least one overdue care follow-up. Omit (false)
  // on read paths that don't load the follow-up feed.
  hasOverdueFollowUp?: boolean;
  // Whether to raise no_over_shepherd. The caller decides this (coverage data
  // available AND the shepherd has no active assignment); omit on paths without
  // coverage context so a transient read failure never implies "no coach".
  noOverShepherd?: boolean;
  // health-checks-reset: an "as-of" reset baseline (ISO YYYY-MM-DD) that floors
  // the effective last-contact date. A baseline measures staleness/first-contact
  // FROM the reset, so a freshly-reset leader reads "contacted as of baseline"
  // rather than stale or never-contacted. Omit (null) for today's behaviour. It
  // ONLY governs the two time-derived reasons (no_contact_yet, stale_last_contact);
  // the admin-set reasons (concern/needs_follow_up/overdue_touchpoint) are cleared
  // at the data layer by the reset, never masked here.
  baselineIso?: string | null;
};

// The one place that decides which attention reasons a care row raises. The
// collected reasons are sorted by REASON_PRIORITY before returning, so the
// first element is always the top reason regardless of the push order below.
export function detectCareReasons(
  care: CareAttentionRow | null,
  ctx: DetectCareReasonsContext
): CareAttentionReason[] {
  const reasons: CareAttentionReason[] = [];

  if (care?.next_touchpoint_due && care.next_touchpoint_due < ctx.todayIso) {
    reasons.push("overdue_touchpoint");
  }
  if (ctx.hasOverdueFollowUp) {
    reasons.push("overdue_care_follow_up");
  }
  if (care?.current_status === "concern") {
    reasons.push("concern_status");
  }
  if (care?.current_status === "needs_follow_up") {
    reasons.push("needs_follow_up_status");
  }
  // Effective last-contact floor: the later of the real last contact and the
  // reset baseline. A baseline present means "treat as contacted at baseline",
  // which both suppresses no_contact_yet and restarts the staleness clock.
  const effectiveContact = laterIso(
    care?.last_contact_at ?? null,
    ctx.baselineIso ?? null
  );
  if (effectiveContact === null) {
    reasons.push("no_contact_yet");
  } else if (
    differenceInDaysIso(ctx.todayIso, effectiveContact) > ctx.staleDays
  ) {
    reasons.push("stale_last_contact");
  }
  if (ctx.noOverShepherd) {
    reasons.push("no_over_shepherd");
  }
  if (care?.current_status === "needs_encouragement") {
    reasons.push("needs_encouragement_status");
  }
  return reasons.sort((a, b) => REASON_PRIORITY[a] - REASON_PRIORITY[b]);
}

// Derive the chip/filter boolean from the reasons, so it is exactly the
// chip-worthy subset and can never disagree with the queue.
export function needsAttentionFromReasons(
  reasons: CareAttentionReason[]
): boolean {
  return reasons.some((reason) => ATTENTION_CHIP_REASONS.has(reason));
}
