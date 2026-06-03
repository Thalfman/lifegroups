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
  GroupSetupCategory,
} from "@/lib/dashboard/labels";

// Setup is "complete" when the group has at least one active leader AND its
// meeting day + time are both set. The two specific gaps each get their own
// label so the operator knows exactly what's missing; if both are missing we
// surface the leader gap first (a group can't run without a leader at all),
// falling back to the generic "Needs setup" when neither specific gap applies
// (defensive — shouldn't happen given the two checks, but keeps the union
// total).
export function setupCategory(args: {
  hasLeader: boolean;
  meetingDay: string | null;
  meetingTime: string | null;
}): GroupSetupCategory {
  const hasMeeting =
    Boolean(args.meetingDay?.trim()) && Boolean(args.meetingTime?.trim());
  if (!args.hasLeader) return "needs_leader";
  if (!hasMeeting) return "missing_meeting";
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
