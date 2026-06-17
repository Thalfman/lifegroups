// Sort comparators for the Groups Ops table (issue #325). Pure, exported, and
// unit-tested so the column ordering is a locked spec rather than inline logic
// buried in the directory component. They sort over the values the directory
// already derives (the four status categories, the resolved leader text, the
// meeting day/time, and the latest-week check-in) — they introduce no new reads.
//
// Each comparator orders ascending; the table flips the result for a descending
// click. Every comparator is total and stable-friendly: it breaks ties on the
// group's display name so two rows that match on the sorted column keep a
// deterministic, human-meaningful order rather than depending on input order.

import { GROUP_HEALTH_GRADE_LADDER } from "@/lib/admin/group-health";
import type { GroupHealthLetter } from "@/types/enums";
import type {
  GroupCapacityCategory,
  GroupHealthCategory,
  GroupSetupCategory,
} from "@/lib/dashboard/labels";

// The columns the operator can sort by. "group" is the default; the rest map to
// the table's other sortable headers. "checkin" sorts by the latest-week
// session status the row already carries (no per-group read).
export type GroupsTableSortKey =
  | "group"
  | "leader"
  | "setup"
  | "health"
  | "capacity"
  | "meeting"
  | "checkin";

export type GroupsTableSortDir = "asc" | "desc";

// The minimal, already-derived row shape the comparators sort over. The
// directory assembles one of these per visible group from the same maps the
// cards use; the comparators never reach back into raw rows or read models.
export type GroupsTableSortRow = {
  // The group's display name — the default sort and the universal tie-breaker.
  name: string;
  // Resolved "leader · co-leader" text, or null when unassigned (sorts last).
  leaderText: string | null;
  setup: GroupSetupCategory;
  health: GroupHealthCategory;
  // The Group-Health Grade letter (A–D), or null when not assessed.
  healthGrade: GroupHealthLetter | null;
  capacity: GroupCapacityCategory;
  // Numeric meeting-day index (Sun=0 … Sat=6), or null when no day is set.
  meetingDayIndex: number | null;
  // Minutes-since-midnight of the meeting time, or null when unset.
  meetingMinutes: number | null;
  // A sortable rank for the latest-week check-in state (see CHECKIN_RANK).
  checkinRank: number;
};

// Setup ordering: most-in-need first so an ascending sort surfaces the gaps. A
// fully complete group sorts last; the two named gaps lead, then generic setup.
const SETUP_RANK: Record<GroupSetupCategory, number> = {
  needs_leader: 0,
  missing_meeting: 1,
  needs_setup: 2,
  complete: 3,
};

// Capacity ordering: fullest first, so an ascending sort surfaces the groups
// closest to capacity.
const CAPACITY_RANK: Record<GroupCapacityCategory, number> = {
  full: 0,
  near_full: 1,
  open: 2,
};

// Health-category ordering used only as a fallback when neither row carries a
// grade letter (both "not assessed"): needs-attention before no-concerns before
// not-assessed, so concerns lead an ascending sort.
const HEALTH_CATEGORY_RANK: Record<GroupHealthCategory, number> = {
  needs_attention: 0,
  no_concerns: 1,
  not_assessed: 2,
};

// Latest-week check-in ordering, worst-first so an ascending sort surfaces the
// groups that still owe a check-in. Kept in lockstep with checkinRankForStatus
// below, which is what the directory calls to stamp each row.
export const CHECKIN_RANK = {
  not_submitted: 0,
  no_record: 1,
  did_not_meet: 2,
  planned_pause: 3,
  admin_entered: 4,
  submitted: 5,
} as const;

// Worse grade sorts first on an ascending sort (D before A), matching the other
// columns' "most-in-need first" reading. A missing grade ("not assessed") sorts
// after every graded group so unassessed rows trail rather than masquerade as
// the best grade.
function gradeRank(letter: GroupHealthLetter | null): number {
  if (letter === null) return Number.POSITIVE_INFINITY;
  // The ladder is A=0 … D=3 (a higher index is a worse grade); negate so a
  // worse grade yields a smaller rank and therefore sorts first ascending.
  return -GROUP_HEALTH_GRADE_LADDER.indexOf(letter);
}

// Direction-invariant "missing value last" verdict. A row with no value for the
// sorted column always trails one that has a value, in BOTH asc and desc — an
// unset value is "no information", not an extreme, so it must not flip to the
// top on a descending click. Returns a comparison when exactly one side is
// missing, 0 when both are missing (defer to the value/tie-break path), and
// null when neither is missing (the flippable value comparison takes over).
function missingLastVerdict(
  aMissing: boolean,
  bMissing: boolean
): number | null {
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1; // a trails
  if (bMissing) return -1; // a leads
  return null; // both present
}

// Compare one optional dimension with the file's two invariants baked in:
// a missing value ALWAYS trails a present one (both directions), and two
// present values order ascending then flip for a descending sort. Returns 0
// when both are missing or the present values tie, so the caller can fall
// through to the next dimension (e.g. meeting time after day) or the name
// tie-break. Threading `dir` here — rather than negating the whole column
// result downstream — is what keeps "missing last" from flipping to the top
// on a descending click.
function compareOptionalDimension(
  aValue: number | null,
  bValue: number | null,
  dir: GroupsTableSortDir
): number {
  const verdict = missingLastVerdict(aValue === null, bValue === null);
  if (verdict !== null) {
    // Exactly one missing → that row trails, invariant of direction. Both
    // missing → 0 (verdict), defer to the next dimension / tie-break.
    return verdict;
  }
  const value = (aValue as number) - (bValue as number);
  return dir === "asc" ? value : -value;
}

// The fully-directed comparison for one column: missing values are held last
// invariantly (via compareOptionalDimension), present values flip for a
// descending sort, and rows that tie on the column return 0 so the caller can
// apply the always-ascending name tie-break. Unlike the prior design, this
// returns the final directed result for the column — the caller never negates
// it — so columns with a secondary optional dimension (meeting time after day)
// or an optional primary value (health grade) keep their missing rows last in
// BOTH directions instead of flipping to the top on a descending click.
function compareColumnValue(
  key: GroupsTableSortKey,
  a: GroupsTableSortRow,
  b: GroupsTableSortRow,
  dir: GroupsTableSortDir
): number {
  const flip = dir === "asc" ? 1 : -1;
  switch (key) {
    case "group":
      // The name IS the value here, so it flips with direction (unlike the
      // tie-break, which stays ascending for every other column).
      return flip * a.name.localeCompare(b.name);
    case "leader": {
      const verdict = missingLastVerdict(
        a.leaderText === null,
        b.leaderText === null
      );
      // Unassigned leaders trail invariantly; assigned ones flip with direction.
      if (verdict !== null && verdict !== 0) return verdict;
      return flip * (a.leaderText ?? "").localeCompare(b.leaderText ?? "");
    }
    case "setup":
      return flip * (SETUP_RANK[a.setup] - SETUP_RANK[b.setup]);
    case "health": {
      // An ungraded ("not assessed") grade is missing, not an extreme: when
      // exactly one row is ungraded it trails in BOTH directions rather than
      // riding to the top of a descending sort.
      const verdict = missingLastVerdict(
        a.healthGrade === null,
        b.healthGrade === null
      );
      if (verdict !== null && verdict !== 0) return verdict;
      // Both graded (flip with direction) — or both ungraded, the ∞ − ∞ = NaN
      // case that falls through to the coarse category rank below.
      const byGrade = gradeRank(a.healthGrade) - gradeRank(b.healthGrade);
      if (Number.isFinite(byGrade) && byGrade !== 0) return flip * byGrade;
      // Equal grade, or both ungraded: a needs-attention group still leads a
      // plain not-assessed. Kept direction-invariant so the "more concern
      // first" refinement reads the same whichever way the column is sorted.
      return HEALTH_CATEGORY_RANK[a.health] - HEALTH_CATEGORY_RANK[b.health];
    }
    case "capacity":
      return flip * (CAPACITY_RANK[a.capacity] - CAPACITY_RANK[b.capacity]);
    case "meeting": {
      // Day leads, time breaks the day tie. Each leg holds its own missing
      // value last invariantly (a set day with no time stays after the timed
      // groups on that day, in both directions).
      const byDay = compareOptionalDimension(
        a.meetingDayIndex,
        b.meetingDayIndex,
        dir
      );
      if (byDay !== 0) return byDay;
      return compareOptionalDimension(a.meetingMinutes, b.meetingMinutes, dir);
    }
    case "checkin":
      return flip * (a.checkinRank - b.checkinRank);
  }
}

// Public comparator factory. Returns an Array.prototype.sort comparator for the
// given column + direction. Missing values always sort last (both directions);
// the present-value ordering flips for descending; and equal-on-column rows fall
// to an always-ascending name tie-break so two rows never reverse merely because
// the column direction did.
export function compareGroupsBy(
  key: GroupsTableSortKey,
  dir: GroupsTableSortDir
): (a: GroupsTableSortRow, b: GroupsTableSortRow) => number {
  return (a, b) => {
    const directed = compareColumnValue(key, a, b, dir);
    if (directed !== 0) return directed;

    // Universal, always-ascending tie-break: keep equal rows in a stable,
    // human-meaningful order regardless of the column direction.
    return a.name.localeCompare(b.name);
  };
}

// Sort a copy of `rows` by the given column + direction. Pure: never mutates
// the input array, so the caller's memoized source list is untouched.
export function sortGroupsTableRows(
  rows: readonly GroupsTableSortRow[],
  key: GroupsTableSortKey,
  dir: GroupsTableSortDir
): GroupsTableSortRow[] {
  return [...rows].sort(compareGroupsBy(key, dir));
}

// ---------------------------------------------------------------------------
// Row-field derivations (shared with the directory so the comparators sort the
// SAME values the table renders). All pure: they translate the group's stored
// meeting_day / meeting_time / latest-week session into the sortable scalars on
// GroupsTableSortRow — no new reads.
// ---------------------------------------------------------------------------

// Map a stored meeting-day name (the groups.meeting_day free-text day) to a
// 0=Sun … 6=Sat index for sorting. Case- and whitespace-insensitive; an unset
// or unrecognized day yields null so it sorts last.
const DAY_NAME_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function meetingDayIndexFromName(day: string | null): number | null {
  const key = day?.trim().toLowerCase();
  if (!key) return null;
  return DAY_NAME_INDEX[key] ?? null;
}

// Map a stored meeting time ("HH:MM" / "HH:MM:SS") to minutes since midnight for
// sorting. An unset or unparseable time yields null so it sorts last.
export function meetingMinutesFromTime(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

// Map a latest-week attendance-session status (or its absence) to the sortable
// check-in rank. Centralized here so the worst-first ordering stays in lockstep
// with CHECKIN_RANK and the directory never re-derives it. An unknown status
// falls back to the "no record" rank rather than throwing.
export function checkinRankForStatus(status: string | null): number {
  switch (status) {
    case "not_submitted":
      return CHECKIN_RANK.not_submitted;
    case "did_not_meet":
      return CHECKIN_RANK.did_not_meet;
    case "planned_pause":
      return CHECKIN_RANK.planned_pause;
    case "admin_entered":
      return CHECKIN_RANK.admin_entered;
    case "submitted":
      return CHECKIN_RANK.submitted;
    default:
      return CHECKIN_RANK.no_record;
  }
}
