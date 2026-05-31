// The Group-Health Grade pipeline behind one interface (PRD Q12 / ADR 0004 D8).
// Producing the grade Julian actually sees is a three-step ordering — compute
// the rubric letter, apply any active override, then rank/segment by the
// *resulting effective* letter — and that ordering is the part that's easy to
// get subtly wrong (e.g. ranking by the computed letter while the surface
// shows the override). This facade owns the ordering so a caller learns one
// function instead of reassembling `resolveGrade` + `rankByGrade` +
// `segmentByGrade` at each call site; those stay as the facade's internal
// seams (and keep their own unit tests).
//
// Pure: no DB, no I/O. The override map is passed in (its read lands with
// #129); pass an empty map to rank/segment the computed grade as-is.

import type { GroupHealthLetter } from "@/types/enums";
import {
  resolveGrade,
  type GradeOverride,
  type ResolvedGrade,
} from "@/lib/admin/group-health-override";
import {
  rankByGrade,
  segmentByGrade,
  type GradedGroup,
  type GradeSegmentation,
} from "@/lib/admin/group-health-segmentation";

// A group's identity plus the rubric-computed letter — the facade's input per
// group (null when the rubric couldn't grade it yet).
export type ComputedGroupGrade = {
  group_id: string;
  group_name: string;
  computed_letter: GroupHealthLetter | null;
};

// A group with its grade fully resolved: the computed letter, the override
// applied, and the effective letter the surface should rank and show.
export type ResolvedGroupGrade = ComputedGroupGrade & {
  resolved: ResolvedGrade;
};

export type GroupGradeBoard = {
  // Best-to-worst by effective grade (ungraded last), name breaking ties.
  // The "which groups need me" list (PRD Q12 Job 3).
  ranked: ResolvedGroupGrade[];
  // The same groups bucketed A->D by effective grade, plus the unassessed.
  segmented: GradeSegmentation;
};

// Resolve every group's effective grade from its override, then rank and
// segment the groups by that effective letter. The single entry point callers
// use; ranking and segmentation always agree because they read the same
// resolved letter.
export function resolveGroupGradeBoard(
  groups: ComputedGroupGrade[],
  overrides: ReadonlyMap<string, GradeOverride | null>,
  currentPeriodMonth: string
): GroupGradeBoard {
  const resolved: ResolvedGroupGrade[] = groups.map((g) => ({
    ...g,
    resolved: resolveGrade(
      g.computed_letter,
      overrides.get(g.group_id) ?? null,
      currentPeriodMonth
    ),
  }));

  // Rank and segment by the *effective* letter; map the ranked order back to
  // the resolved rows so callers keep the computed/override detail alongside.
  const asGraded = (r: ResolvedGroupGrade): GradedGroup => ({
    group_id: r.group_id,
    group_name: r.group_name,
    letter: r.resolved.effective_letter,
  });
  const byId = new Map(resolved.map((r) => [r.group_id, r]));
  const ranked = rankByGrade(resolved.map(asGraded)).map(
    (g) => byId.get(g.group_id)!
  );
  const segmented = segmentByGrade(resolved.map(asGraded));

  return { ranked, segmented };
}
