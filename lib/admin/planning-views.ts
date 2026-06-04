// Opinionated saved admin views for the Planning calendar (#331).
//
// Pure and client-safe (no supabase imports — like master-calendar-label.ts),
// so the Planning calendar shell can derive every opinionated view from the
// already-loaded `loadMasterCalendar` occurrences + group leaders without a new
// read, and so the "Needs coverage" predicate can be unit-tested in isolation.
//
// These views are PRIMARY affordances on /admin/planning; the existing
// fine-grained filters move to a collapsible/secondary area. A view narrows the
// occurrence set; the advanced filters still apply on top of whatever view is
// active.
//
// "Needs coverage" is calendar/STAFFING coverage — a scheduled real meeting of
// an active group that has no leader/co-leader assigned. It is NEVER
// shepherd-care pastoral coverage (that lives in shepherd_coverage_assignments,
// a different concept) and deliberately does NOT touch the over-shepherd source.

import { isoWeekStart } from "@/lib/shared/church-time";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";

export type PlanningViewKey =
  | "all"
  | "this-week"
  | "needs-coverage"
  | "cancelled-off"
  | "by-leader";

// The opinionated views in display order. "All meetings" is the neutral
// default (no opinion) so the calendar still opens on the full month; the four
// opinionated views from the PRD (#331) follow as primary affordances.
export const PLANNING_VIEWS: { key: PlanningViewKey; label: string }[] = [
  { key: "all", label: "All meetings" },
  { key: "this-week", label: "This week" },
  { key: "needs-coverage", label: "Needs coverage" },
  { key: "cancelled-off", label: "Cancelled / OFF" },
  { key: "by-leader", label: "By leader" },
];

// "Needs coverage" predicate (#331, PRD req 12). Calendar/STAFFING coverage,
// never pastoral coverage. An occurrence is a coverage gap ONLY when ALL hold:
//   - the group's lifecycle is `active` (exclude every other status — paused,
//     closed/archived, at-risk, etc.; loadMasterCalendar includes non-closed
//     groups regardless of lifecycle, so this filters in-memory);
//   - the occurrence status is `scheduled` (exclude `off` and `cancelled`);
//   - it is a real meeting occurrence (exclude special/non-meeting rows);
//   - the group has NO assigned leader or co-leader.
//
// OFF weeks, cancelled occurrences, inactive/paused/closed groups, and
// non-meeting rows are explicitly excluded — none are actionable staffing gaps.
export function occurrenceNeedsCoverage(occurrence: MasterOccurrence): boolean {
  if (occurrence.lifecycleStatus !== "active") return false;
  if (occurrence.status !== "scheduled") return false;
  if (!occurrence.isMeetingOccurrence) return false;
  return occurrence.leaders.length === 0;
}

// "Cancelled / OFF" predicate: occurrences a director scans for the opposite
// reason — meetings explicitly NOT happening this month (cancelled one-offs or
// OFF weeks).
export function occurrenceIsCancelledOrOff(
  occurrence: MasterOccurrence
): boolean {
  return occurrence.status === "off" || occurrence.status === "cancelled";
}

// Whether an occurrence's date falls in the same ISO week (Mon–Sun) as the
// church-local "today". Pure: both ends are reduced to their Monday-of-week via
// the shared church-time helper so the comparison is a stable string compare.
export function occurrenceIsThisWeek(
  occurrence: MasterOccurrence,
  todayIso: string
): boolean {
  return isoWeekStart(occurrence.date) === isoWeekStart(todayIso);
}

// Apply an opinionated view to the full occurrence set. "by-leader" does NOT
// narrow the set (every occurrence is grouped, not filtered) — the grouping
// happens at render time via `groupOccurrencesByLeader`; here it is a
// pass-through so the advanced filters still compose on top. "all" is the
// neutral pass-through default.
export function filterOccurrencesForView(
  occurrences: MasterOccurrence[],
  view: PlanningViewKey,
  todayIso: string
): MasterOccurrence[] {
  switch (view) {
    case "this-week":
      return occurrences.filter((o) => occurrenceIsThisWeek(o, todayIso));
    case "needs-coverage":
      return occurrences.filter(occurrenceNeedsCoverage);
    case "cancelled-off":
      return occurrences.filter(occurrenceIsCancelledOrOff);
    case "by-leader":
    case "all":
    default:
      return occurrences;
  }
}

// A leader-grouped bucket for the "By leader" view. Occurrences with multiple
// leaders appear under each of their leaders; occurrences with no leader fall
// into the synthetic UNASSIGNED bucket so the gap stays visible rather than
// silently dropped.
export type LeaderGroup = {
  // The stable profile id, or null for the synthetic "Unassigned" bucket.
  profileId: string | null;
  name: string;
  occurrences: MasterOccurrence[];
};

export const UNASSIGNED_LEADER_NAME = "Unassigned";

// Group occurrences by leader for the "By leader" view (#331). Confirmed
// sufficient from `loadMasterCalendar` alone: each occurrence already carries
// its group's deduped leader list (profileId + name), so no new read is needed.
// Buckets are sorted by leader name with the Unassigned bucket pinned last.
//
// `selectedLeaderIds` composes with the advanced Leader/co-leader filter: that
// filter keeps an occurrence if ANY of its leaders matches, so a co-led group
// (Dana+Sam) filtered to Dana still carries Sam in its leader list. Without
// this, grouping would render a stray Sam bucket. When a non-empty set is
// passed, only buckets for those leaders are produced (co-leaders outside the
// selection are dropped); an empty/omitted set groups under every leader.
export function groupOccurrencesByLeader(
  occurrences: MasterOccurrence[],
  selectedLeaderIds?: ReadonlySet<string>
): LeaderGroup[] {
  const byLeader = new Map<string, LeaderGroup>();
  const unassigned: MasterOccurrence[] = [];
  const hasSelection =
    selectedLeaderIds !== undefined && selectedLeaderIds.size > 0;

  for (const occ of occurrences) {
    if (occ.leaders.length === 0) {
      unassigned.push(occ);
      continue;
    }
    for (const leader of occ.leaders) {
      if (hasSelection && !selectedLeaderIds.has(leader.profileId)) continue;
      const bucket = byLeader.get(leader.profileId) ?? {
        profileId: leader.profileId,
        name: leader.name,
        occurrences: [],
      };
      bucket.occurrences.push(occ);
      byLeader.set(leader.profileId, bucket);
    }
  }

  const groups = Array.from(byLeader.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  if (unassigned.length > 0) {
    groups.push({
      profileId: null,
      name: UNASSIGNED_LEADER_NAME,
      occurrences: unassigned,
    });
  }
  return groups;
}
