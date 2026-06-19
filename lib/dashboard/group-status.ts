// Derive the four independent group-status categories (issue #300) from a
// group's already-assembled inputs. Pure: no I/O. These map existing shared
// rules (capacityStatus, gradeAtOrBelow, lifecycle enum) onto the coarser
// display categories the Groups surface scans by — they do NOT re-roll the
// per-surface row assembly that ADR 0011 keeps per-surface; they only translate
// values the caller already computed into the four labelled zones.

import type { GroupHealthLetter } from "@/types/enums";
import { gradeAtOrBelow } from "@/lib/admin/group-health";
import type { CapacityStatus } from "@/lib/admin/metrics";
import type {
  GroupCapacityCategory,
  GroupHealthCategory,
  GroupLifecycleCategory,
  GroupSetupCategory,
} from "@/lib/dashboard/labels";

// Setup is "complete" when the group has at least one active leader, its
// meeting day + time are both set, AND it has an effective capacity to measure
// against (plan §4: Needs Setup lists groups missing leader, meeting details,
// capacity, or other setup info). The two named gaps each get their own label
// so the operator knows exactly what's missing; if both are missing we surface
// the leader gap first (a group can't run without a leader at all). A missing
// effective capacity has no dedicated label, so it falls back to the generic
// "Needs setup" — the capacity zone is unknown until a default or per-group
// override resolves one.
//
// `effectiveCapacity` is the SAME defaults → per-group-override value the cards
// and list resolve (lib/admin/metrics.effectiveCapacity); null means no zone
// can be computed. Pass it through rather than re-resolving here (ADR 0011).
export function setupCategory(args: {
  hasLeader: boolean;
  meetingDay: string | null;
  meetingTime: string | null;
  effectiveCapacity: number | null;
}): GroupSetupCategory {
  const hasMeeting =
    Boolean(args.meetingDay?.trim()) && Boolean(args.meetingTime?.trim());
  if (!args.hasLeader) return "needs_leader";
  if (!hasMeeting) return "missing_meeting";
  if (args.effectiveCapacity === null) return "needs_setup";
  return "complete";
}

// Health = the Group-Health Grade (Q12). A group graded at or below the
// director's Watch threshold needs attention; a group graded above it has no
// current concerns; no grade yet reads as not assessed. `watchGrade` is the
// director-tuned threshold from Settings (metric_defaults.group_health_watch_grade).
export function healthCategory(
  computedLetter: GroupHealthLetter | null,
  watchGrade: GroupHealthLetter
): GroupHealthCategory {
  if (computedLetter === null) return "not_assessed";
  return gradeAtOrBelow(computedLetter, watchGrade)
    ? "needs_attention"
    : "no_concerns";
}

// Capacity maps the shared capacityStatus onto the three operator-facing words.
// A group excluded from capacity metrics, or with no effective capacity to
// measure against, reads as "open" (nothing flagged). "open_by_choice" — kept
// intentionally over capacity — also reads as "open" rather than "full", since
// it is not flagged as needing action.
export function capacityCategory(
  status: CapacityStatus
): GroupCapacityCategory {
  if (status === "full") return "full";
  if (status === "warning") return "near_full";
  return "open";
}

// ---------------------------------------------------------------------------
// List-tab membership (issue #300 / #308). Pure predicates for the five Groups
// list tabs so the spec (plan §4 tab definitions) is locked in by tests and the
// directory component just maps over them. The four derived categories plus the
// per-group triage signals fully determine membership.
// ---------------------------------------------------------------------------

export type GroupListTab =
  | "all"
  | "needs_setup"
  | "needs_health_check"
  | "needs_attention"
  | "archived";

// The triage signals the four status categories don't themselves carry.
export type GroupTriageSignals = {
  // One or more required ratings (spiritual-growth / group-question) are not yet
  // recorded — distinct from "not assessed", since an attendance-only grade
  // letter can exist while a rating is still missing.
  missingRequiredRatings: boolean;
  // The group has an open follow-up concern (generic follow-up or the director's
  // group-health follow-up flag).
  hasOpenFollowUp: boolean;
  // A leader / co-leader of the group has an open shepherd-care concern.
  hasCareConcern: boolean;
};

export type GroupTabInput = {
  lifecycle: GroupLifecycleCategory;
  setup: GroupSetupCategory;
  health: GroupHealthCategory;
  capacity: GroupCapacityCategory;
  signals: GroupTriageSignals;
};

// Needs Health Check (plan §4): groups that are not assessed OR missing one or
// more required ratings. The missing-ratings leg matters because computeGrade
// can produce a letter from attendance alone, so a group with attendance data
// but no spiritual-growth / group-question rating would otherwise look assessed
// and drop out of the queue.
export function needsHealthCheck(input: GroupTabInput): boolean {
  return (
    input.health === "not_assessed" || input.signals.missingRequiredRatings
  );
}

// Needs Attention (plan §4): groups with health, capacity, follow-up, OR care
// concerns. A full / near-full group, or one with open follow-ups / care
// concerns but a good grade, must still surface for triage.
export function needsAttention(input: GroupTabInput): boolean {
  return (
    input.health === "needs_attention" ||
    input.capacity === "full" ||
    input.capacity === "near_full" ||
    input.signals.hasOpenFollowUp ||
    input.signals.hasCareConcern
  );
}

// Whether a group belongs in the given list tab. Archived sits apart (every
// other tab is scoped to active/non-archived groups); "all" is every active
// group.
export function matchesListTab(
  tab: GroupListTab,
  input: GroupTabInput
): boolean {
  if (tab === "archived") return input.lifecycle === "archived";
  if (input.lifecycle === "archived") return false;
  switch (tab) {
    case "all":
      return true;
    case "needs_setup":
      return input.setup !== "complete";
    case "needs_health_check":
      return needsHealthCheck(input);
    case "needs_attention":
      return needsAttention(input);
  }
}

// Operator-facing description of each tab's membership rule, rendered under
// the tab bar so a group's presence in a bucket is explainable on sight — the
// predicates above are otherwise invisible code. Lives beside the rules it
// describes so the copy and the predicate can't drift apart unnoticed.
const LIST_TAB_DESCRIPTIONS: Record<GroupListTab, string> = {
  all: "Every group that isn’t archived.",
  needs_setup:
    "Groups missing a shepherd, meeting day/time, or a capacity to measure against.",
  needs_health_check:
    "Groups with no Group-Health Grade yet, or missing a required rating.",
  needs_attention:
    "Groups with a low Group-Health Grade, full or near-full capacity, an open follow-up, or a shepherd-care concern.",
  archived: "Archived groups are kept, not deleted — restore one any time.",
};

export function listTabDescription(tab: GroupListTab): string {
  return LIST_TAB_DESCRIPTIONS[tab];
}
