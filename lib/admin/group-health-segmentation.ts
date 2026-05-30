// Pure dashboard segmentation for the Group-Health Grade (PRD Q12 / #129).
// No DB, no I/O — given each active group's grade, rank and segment the groups
// by health so Julian can focus attention on the groups that need it.
//
// Segmentation is orthogonal to how the letter was derived: it ranks whatever
// grade a row carries, so it sorts the computed grade today and the
// override-resolved effective grade once override-wiring lands (#129).

import type { GroupHealthLetter } from "@/types/enums";

// The minimal shape segmentation needs from an overview row: who the group is
// and its grade letter (null when the rubric couldn't grade it yet).
export type GradedGroup = {
  group_id: string;
  group_name: string;
  letter: GroupHealthLetter | null;
};

export type GradeSegment = {
  letter: GroupHealthLetter;
  groups: GradedGroup[];
};

export type GradeSegmentation = {
  // Always the full A→D ladder in order, so the dashboard can render every
  // bucket (an empty one is itself signal — "no A groups this month").
  segments: GradeSegment[];
  // Groups with no grade yet, kept out of the lettered ladder.
  unassessed: GradedGroup[];
};

const LETTER_ORDER: GroupHealthLetter[] = ["A", "B", "C", "D"];

function byName(a: GradedGroup, b: GradedGroup): number {
  return a.group_name.localeCompare(b.group_name);
}

// Worst-to-... rank weight: A best, ungraded sinks below D so groups with no
// signal don't masquerade as healthy in a ranked list.
function rankWeight(letter: GroupHealthLetter | null): number {
  return letter === null ? LETTER_ORDER.length : LETTER_ORDER.indexOf(letter);
}

// A flat best→worst ordering of the same groups: grade first, name breaking
// ties. The dashboard's "which groups need me" list.
export function rankByGrade(groups: GradedGroup[]): GradedGroup[] {
  return [...groups].sort(
    (a, b) => rankWeight(a.letter) - rankWeight(b.letter) || byName(a, b),
  );
}

export function segmentByGrade(groups: GradedGroup[]): GradeSegmentation {
  const segments: GradeSegment[] = LETTER_ORDER.map((letter) => ({
    letter,
    groups: groups.filter((g) => g.letter === letter).sort(byName),
  }));
  const unassessed = groups.filter((g) => g.letter === null).sort(byName);
  return { segments, unassessed };
}
