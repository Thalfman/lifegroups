import type { GroupsRow } from "@/types/database";
import type {
  GroupHealthLetter,
  GroupHealthOverrideScope,
  LeaderHealthLetter,
  ShepherdCareStatus,
} from "@/types/enums";
import type { Rubric, RubricScores } from "@/lib/admin/health-rubric";
import { resolveLeaderGrade } from "@/lib/admin/leader-rubric-grade";
import { resolveGroupRubricGrade } from "@/lib/admin/group-rubric-grade";
import type {
  ActiveShepherdCoverageAssignmentSummary,
  OverShepherdListRow,
  ShepherdCareDirectoryEntry,
} from "@/lib/supabase/read-models";

// Pure model for the canonical Care accordion (#373, ADR 0016). Care is now an
// accordion grouped by Over-Shepherd, collapsed by default: each pane lists the
// Leaders that Over-Shepherd covers (name + the group(s) they lead) and, opened,
// each Leader carries their Leader Care Status, an at-a-glance contact line, and
// the Group-Health Grade / Leader-Health Grade / Care Notes / Prayer Requests
// the panel renders (slices #377/#378/#381). Those four were placeholder slots;
// they are now filled from optional enrichment maps the page injects.
//
// This stays READ-ONLY consolidation: it reuses the existing column-allowlisted
// read-models (over-shepherds, active coverage assignments, the care directory,
// group_leaders, groups) plus the enrichment maps. Coverage assignments are the
// backbone — there are deliberately NO headcounts / member counts here. An
// Unassigned pane mirrors the Coverage card's Unassigned bucket so a Leader with
// no active Over-Shepherd coverage is never dropped.

// The minimal leader-input shape the accordion needs from the active
// group_leaders rows: which Leader leads which group. Roles other than
// leader/co_leader (e.g. plain members) must be filtered out by the caller —
// they don't describe a group the person LEADS.
export type CareAccordionGroupLeader = {
  profile_id: string;
  group_id: string;
};

// One active group a Leader leads, with its Group-Health Grade letter for the
// current Ministry Year (null when ungraded or off-season).
export type CareAccordionLeaderGroup = {
  id: string;
  name: string;
  healthGrade: GroupHealthLetter | null;
};

// The Care Notes / Prayer Requests state for a Leader, as the admin may see it
// (#381 / ADR 0017). The OS-authored notes about a Leader are sealed by default;
// the admin sees counts only when that Leader's transparency toggle is on. We
// never carry note BODIES here — only presence/counts behind the RLS grant.
export type CareAccordionNoteState = {
  // "visible" when the Leader's transparency grant is on (the admin may read the
  // notes); "sealed" otherwise. Sealed is the default for every Leader.
  transparency: "sealed" | "visible";
  careNoteCount: number;
  prayerCount: number;
};

const SEALED_NOTE_STATE: CareAccordionNoteState = {
  transparency: "sealed",
  careNoteCount: 0,
  prayerCount: 0,
};

// The grant boolean the inline transparency toggle renders from (#467).
// "visible" IS the grant — buildNoteStateByLeaderId marks a Leader visible
// exactly when their note_transparency_grant row is on, never from readable
// rows (see the ADR 0023 note on buildNoteStateByLeaderId). Named here so the
// panel and tests share one mapping instead of comparing the union string in
// the UI.
export function isNoteTransparencyGranted(
  notes: CareAccordionNoteState
): boolean {
  return notes.transparency === "visible";
}

// One Leader inside an Over-Shepherd pane (or the Unassigned pane). Carries the
// pastoral Leader Care Status (null when the Leader has no care profile yet),
// the resolved active groups they lead (with each group's health grade), an
// at-a-glance contact line, the Leader-Health Grade, and the Care Notes / Prayer
// state. The grades/notes come from the enrichment maps; when those are absent
// (no DB, a degraded read, or a unit test) the fields default to "ungraded" /
// "sealed" so the panel never invents a value.
export type CareAccordionLeader = {
  profileId: string;
  fullName: string;
  // Active group(s) this Leader leads, sorted + de-duped, resolved to names.
  // Kept as a flat name list for back-compatible callers/tests.
  groupNames: string[];
  // The same active groups, carrying id + Group-Health Grade for the panel.
  ledGroups: CareAccordionLeaderGroup[];
  // Leader Care Status — the pastoral "is there an issue / what's the next step"
  // signal on the person. null when no care profile exists yet.
  careStatus: ShepherdCareStatus | null;
  // At-a-glance, from the care directory row (no extra read): the spreadsheet's
  // "Last contact" and "Next step" (next touchpoint due). null when unset.
  lastContactAt: string | null;
  nextStepDue: string | null;
  // The Leader-Health Grade letter for the current Ministry Year (#378), or null
  // when ungraded / off-season.
  leaderHealthGrade: LeaderHealthLetter | null;
  // Care Notes + Prayer Requests presence (#381), sealed by default.
  notes: CareAccordionNoteState;
};

export type CareAccordionPane = {
  // null for the synthetic Unassigned pane.
  overShepherdId: string | null;
  overShepherdName: string;
  isUnassigned: boolean;
  leaders: CareAccordionLeader[];
};

export type BuildCareAccordionInput = {
  overShepherds: OverShepherdListRow[];
  assignments: ActiveShepherdCoverageAssignmentSummary[];
  groupLeaders: CareAccordionGroupLeader[];
  groups: GroupsRow[];
  careEntries: ShepherdCareDirectoryEntry[];
  // Optional enrichment (#377/#378/#381). Omitted in unit tests and whenever a
  // read degrades, so the leaders fall back to ungraded / sealed.
  leaderHealthByLeaderId?: ReadonlyMap<string, LeaderHealthLetter | null>;
  groupHealthByGroupId?: ReadonlyMap<string, GroupHealthLetter | null>;
  noteStateByLeaderId?: ReadonlyMap<string, CareAccordionNoteState>;
};

// Resolve each Leader's active led groups (id + name) from the group_leaders rows
// joined to the active groups. Closing a group flips groups.lifecycle_status but
// leaves the group_leaders rows active, so a closed group would otherwise surface
// as a current led group — filter to active groups only (mirrors the prior Care
// page's buildGroupNameByShepherdId). De-duped and name-sorted per leader.
function buildLedGroupsByLeaderId(
  groupLeaders: CareAccordionGroupLeader[],
  groups: GroupsRow[]
): Map<string, { id: string; name: string }[]> {
  const activeById = new Map(
    groups
      .filter((g) => g.lifecycle_status === "active")
      .map((g) => [g.id, g.name] as const)
  );
  const byLeader = new Map<string, { id: string; name: string }[]>();
  for (const gl of groupLeaders) {
    const name = activeById.get(gl.group_id);
    if (!name) continue;
    const list = byLeader.get(gl.profile_id) ?? [];
    if (list.some((g) => g.id === gl.group_id)) continue;
    list.push({ id: gl.group_id, name });
    byLeader.set(gl.profile_id, list);
  }
  for (const [leaderId, list] of byLeader) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    byLeader.set(leaderId, list);
  }
  return byLeader;
}

function leadersSortedByName(
  leaders: CareAccordionLeader[]
): CareAccordionLeader[] {
  return leaders.slice().sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/**
 * Build the Over-Shepherd accordion model for the Care surface (#373).
 *
 * Grouping: each active Over-Shepherd gets a pane (even with zero covered
 * Leaders, so the surface still shows who could take coverage); every Leader in
 * the care directory is placed into the pane of the Over-Shepherd that actively
 * covers them, falling back to the synthetic Unassigned pane. The Unassigned
 * pane is always present (mirroring the Coverage card) so unassigned Leaders are
 * never hidden. Panes and the Leaders within them are name-sorted; the
 * Unassigned pane sorts last.
 */
export function buildCareAccordion(
  input: BuildCareAccordionInput
): CareAccordionPane[] {
  const ledGroupsByLeaderId = buildLedGroupsByLeaderId(
    input.groupLeaders,
    input.groups
  );

  // shepherd_profile_id -> over_shepherd_id, from the active coverage
  // assignments (the backbone). A Leader not in this map is unassigned.
  const overShepherdIdByLeaderId = new Map<string, string>();
  for (const a of input.assignments) {
    overShepherdIdByLeaderId.set(a.shepherd_profile_id, a.over_shepherd_id);
  }

  // Seed a pane per active Over-Shepherd so empty panes still render. Archived
  // (inactive) over-shepherds are excluded — they no longer take coverage.
  const panesById = new Map<string, CareAccordionPane>();
  for (const os of input.overShepherds) {
    if (!os.active) continue;
    panesById.set(os.id, {
      overShepherdId: os.id,
      overShepherdName: os.full_name,
      isUnassigned: false,
      leaders: [],
    });
  }

  const unassigned: CareAccordionPane = {
    overShepherdId: null,
    overShepherdName: "Unassigned",
    isUnassigned: true,
    leaders: [],
  };

  for (const entry of input.careEntries) {
    const ledGroups: CareAccordionLeaderGroup[] = (
      ledGroupsByLeaderId.get(entry.profile.id) ?? []
    ).map((g) => ({
      id: g.id,
      name: g.name,
      healthGrade: input.groupHealthByGroupId?.get(g.id) ?? null,
    }));

    const leader: CareAccordionLeader = {
      profileId: entry.profile.id,
      fullName: entry.profile.full_name,
      groupNames: ledGroups.map((g) => g.name),
      ledGroups,
      careStatus: entry.care?.current_status ?? null,
      lastContactAt: entry.care?.last_contact_at ?? null,
      nextStepDue: entry.care?.next_touchpoint_due ?? null,
      leaderHealthGrade:
        input.leaderHealthByLeaderId?.get(entry.profile.id) ?? null,
      notes:
        input.noteStateByLeaderId?.get(entry.profile.id) ?? SEALED_NOTE_STATE,
    };
    const overShepherdId = overShepherdIdByLeaderId.get(entry.profile.id);
    const pane =
      overShepherdId !== undefined ? panesById.get(overShepherdId) : undefined;
    // An assignment can point at an Over-Shepherd not in the seeded set (e.g. a
    // since-archived one); treat that Leader as unassigned rather than dropping
    // them.
    (pane ?? unassigned).leaders.push(leader);
  }

  const namedPanes = Array.from(panesById.values())
    .map((pane) => ({ ...pane, leaders: leadersSortedByName(pane.leaders) }))
    .sort((a, b) => a.overShepherdName.localeCompare(b.overShepherdName));

  return [
    ...namedPanes,
    { ...unassigned, leaders: leadersSortedByName(unassigned.leaders) },
  ];
}

// ---- Pure enrichment resolvers (#377/#378/#381) -------------------------
// These turn the column-allowlisted raw grade rows + note presence into the
// maps buildCareAccordion consumes. Kept pure (no DB) so they unit-test without
// a client; the read side (lib/supabase/care-accordion-reads.ts) fetches the
// rows and calls these.

// The override object the rubric resolvers expect, from a persisted grade
// row — null unless the row carries one. A row without a period_month is
// treated as set in the current period (matching the detail page's
// resolution), so the resolver's expiry rules still apply.
function persistedOverride<Letter>(
  row: {
    override_letter: Letter | null;
    override_scope: GroupHealthOverrideScope | null;
    override_period_month: string | null;
  },
  periodMonthIso: string
): {
  letter: Letter;
  scope: GroupHealthOverrideScope;
  period_month: string;
} | null {
  return row.override_letter !== null && row.override_scope !== null
    ? {
        letter: row.override_letter,
        scope: row.override_scope,
        period_month: row.override_period_month ?? periodMonthIso,
      }
    : null;
}

// One persisted Leader-Health Grade row, reduced to what resolving the letter
// needs (the rubric engine recomputes the letter from scores + override).
export type LeaderHealthGradeInput = {
  profile_id: string;
  criterion_scores: RubricScores;
  override_letter: LeaderHealthLetter | null;
  override_scope: GroupHealthOverrideScope | null;
  override_period_month: string | null;
};

// Resolve each leader's effective Leader-Health Grade letter for a ministry year.
export function resolveLeaderHealthByLeaderId(
  rows: LeaderHealthGradeInput[],
  rubric: Rubric,
  ministryYear: number,
  periodMonthIso: string
): Map<string, LeaderHealthLetter | null> {
  const out = new Map<string, LeaderHealthLetter | null>();
  for (const row of rows) {
    const resolved = resolveLeaderGrade({
      rubric,
      scores: row.criterion_scores,
      override: persistedOverride(row, periodMonthIso),
      ministryYear,
      currentPeriodMonth: periodMonthIso,
    });
    out.set(row.profile_id, resolved.letter);
  }
  return out;
}

// One persisted Group-Health Grade row, reduced to what resolving the letter
// needs.
export type GroupHealthGradeInput = {
  group_id: string;
  criterion_scores: RubricScores;
  override_letter: GroupHealthLetter | null;
  override_scope: GroupHealthOverrideScope | null;
  override_period_month: string | null;
};

// Resolve each group's effective Group-Health Grade letter for a period.
export function resolveGroupHealthByGroupId(
  rows: GroupHealthGradeInput[],
  rubric: Rubric,
  periodMonthIso: string
): Map<string, GroupHealthLetter | null> {
  const out = new Map<string, GroupHealthLetter | null>();
  for (const row of rows) {
    const grade = resolveGroupRubricGrade({
      rubric,
      scores: row.criterion_scores,
      override: persistedOverride(row, periodMonthIso),
      periodMonth: periodMonthIso,
    });
    out.set(row.group_id, grade.effective_letter);
  }
  return out;
}

// ---- Inline grade entry (ADR 0023) ---------------------------------------
// The accordion's per-Leader panel hosts the SAME grade editors the detail
// page uses (LeaderHealthGradeEditor / GroupRubricGradeEntry), seeded from the
// raw persisted rows the enrichment already fetches. The bundle is built by
// the read side and passed through CareAccordion as one prop, so this model's
// buildCareAccordion stays untouched.

export type CareGradeEntryBundle = {
  // Null in the Jun–Jul off-season: the editors render their closed state and
  // the group editors are suppressed (mirroring the detail page).
  ministryYear: number | null;
  periodMonthIso: string;
  leaderCriteria: Rubric["criteria"];
  groupCriteria: Rubric["criteria"];
  leaderGradeByProfileId: ReadonlyMap<string, LeaderHealthGradeInput>;
  groupGradeByGroupId: ReadonlyMap<string, GroupHealthGradeInput>;
  // False when the rubric or grade-row read failed. The panel then renders the
  // detail page's "reload before editing" guard instead of an editor — saving
  // over a row we failed to read could silently overwrite the saved grade.
  leaderGradesAvailable: boolean;
  groupGradesAvailable: boolean;
};

// What an editor needs as initial values, resolved exactly the way the detail
// page resolves them: the persisted scores, plus the override ONLY while it is
// still live (an expired this-month override must not re-arm the form).
export type GradeEntrySeed<Letter> = {
  scores: RubricScores;
  overrideLetter: Letter | null;
  overrideScope: GroupHealthOverrideScope | null;
};

const EMPTY_SEED = { scores: {}, overrideLetter: null, overrideScope: null };

export function resolveLeaderGradeSeed(
  row: LeaderHealthGradeInput | undefined,
  criteria: Rubric["criteria"],
  // Null in the Jun–Jul off-season: there is no year to resolve against, so
  // the seed is empty and the editor renders its own closed state. Centralised
  // here so every surface hosting the editor gets the off-season rule for free.
  ministryYear: number | null,
  periodMonthIso: string
): GradeEntrySeed<LeaderHealthLetter> {
  if (!row || ministryYear === null) return EMPTY_SEED;
  const resolved = resolveLeaderGrade({
    rubric: { criteria },
    scores: row.criterion_scores,
    override: persistedOverride(row, periodMonthIso),
    ministryYear,
    currentPeriodMonth: periodMonthIso,
  });
  return {
    scores: row.criterion_scores,
    overrideLetter: resolved.overridden ? resolved.letter : null,
    overrideScope: resolved.override_scope ?? null,
  };
}

export function resolveGroupGradeSeed(
  row: GroupHealthGradeInput | undefined,
  criteria: Rubric["criteria"],
  periodMonthIso: string
): GradeEntrySeed<GroupHealthLetter> {
  if (!row) return EMPTY_SEED;
  const grade = resolveGroupRubricGrade({
    rubric: { criteria },
    scores: row.criterion_scores,
    override: persistedOverride(row, periodMonthIso),
    periodMonth: periodMonthIso,
  });
  return {
    scores: row.criterion_scores,
    overrideLetter: grade.overridden ? grade.effective_letter : null,
    overrideScope: grade.override_scope ?? null,
  };
}

// Build the Care Notes / Prayer Requests presence map (#381). The grant set is
// the SOLE source of truth for "visible": since ADR 0023 admins author notes
// themselves, the author RLS arm returns their OWN rows about a still-sealed
// leader — so readable rows are no longer a proxy for the grant. Deriving
// visibility from counts would render the toggle "on" for a sealed leader
// (making it impossible to actually grant from the panel) and mislabel
// author-only counts as leadership visibility. Counts still come from the
// readable rows' subject_profile_id; the panel only shows them when granted.
// Leaders absent from every input default to sealed/0 in buildCareAccordion.
export function buildNoteStateByLeaderId(args: {
  grantedSubjectIds: Iterable<string>;
  careNoteSubjectIds: string[];
  prayerSubjectIds: string[];
}): Map<string, CareAccordionNoteState> {
  const granted = new Set(args.grantedSubjectIds);
  const careCounts = countBy(args.careNoteSubjectIds);
  const prayerCounts = countBy(args.prayerSubjectIds);

  const ids = new Set<string>([
    ...granted,
    ...careCounts.keys(),
    ...prayerCounts.keys(),
  ]);

  const out = new Map<string, CareAccordionNoteState>();
  for (const id of ids) {
    const careNoteCount = careCounts.get(id) ?? 0;
    const prayerCount = prayerCounts.get(id) ?? 0;
    const transparency = granted.has(id) ? "visible" : "sealed";
    out.set(id, { transparency, careNoteCount, prayerCount });
  }
  return out;
}

function countBy(ids: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of ids) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}
