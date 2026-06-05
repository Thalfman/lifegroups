import type { GroupsRow } from "@/types/database";
import type { ShepherdCareStatus } from "@/types/enums";
import type {
  ActiveShepherdCoverageAssignmentSummary,
  OverShepherdListRow,
  ShepherdCareDirectoryEntry,
} from "@/lib/supabase/read-models";

// Pure model for the canonical Care accordion (#373, ADR 0016). Care is now an
// accordion grouped by Over-Shepherd, collapsed by default: each pane lists the
// Leaders that Over-Shepherd covers (name + the group(s) they lead) and, opened,
// each Leader carries their Leader Care Status plus labelled placeholder slots
// for the Group-Health Grade / Leader-Health Grade / Care Notes / Prayer
// Requests that later slices (#377/#378/#381) fill in.
//
// This is READ-ONLY consolidation: it reuses the existing column-allowlisted
// read-models (over-shepherds, active coverage assignments, the care directory,
// group_leaders, groups) and adds NO new reads. Coverage assignments are the
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

// One Leader inside an Over-Shepherd pane (or the Unassigned pane). Carries the
// pastoral Leader Care Status (null when the Leader has no care profile yet) and
// the resolved active group name(s) they lead. The grade/notes/prayer slots are
// intentionally absent from the model — they are placeholders the per-leader
// detail panel renders as labelled "coming soon" slots, not data we read here.
export type CareAccordionLeader = {
  profileId: string;
  fullName: string;
  // Active group(s) this Leader leads, sorted + de-duped, resolved to names.
  groupNames: string[];
  // Leader Care Status — the pastoral "is there an issue / what's the next step"
  // signal on the person. null when no care profile exists yet.
  careStatus: ShepherdCareStatus | null;
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
};

// Resolve each Leader's active group name(s) from the group_leaders rows joined
// to the active groups. Closing a group flips groups.lifecycle_status but leaves
// the group_leaders rows active, so a closed group would otherwise surface as a
// current led group — filter to active groups only (mirrors the prior Care
// page's buildGroupNameByShepherdId).
function buildGroupNamesByLeaderId(
  groupLeaders: CareAccordionGroupLeader[],
  groups: GroupsRow[]
): Map<string, string[]> {
  const nameById = new Map(
    groups
      .filter((g) => g.lifecycle_status === "active")
      .map((g) => [g.id, g.name] as const)
  );
  const namesByLeader = new Map<string, string[]>();
  for (const gl of groupLeaders) {
    const name = nameById.get(gl.group_id);
    if (!name) continue;
    const list = namesByLeader.get(gl.profile_id) ?? [];
    if (!list.includes(name)) list.push(name);
    namesByLeader.set(gl.profile_id, list);
  }
  for (const [leaderId, names] of namesByLeader) {
    names.sort((a, b) => a.localeCompare(b));
    namesByLeader.set(leaderId, names);
  }
  return namesByLeader;
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
  const groupNamesByLeaderId = buildGroupNamesByLeaderId(
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
    const leader: CareAccordionLeader = {
      profileId: entry.profile.id,
      fullName: entry.profile.full_name,
      groupNames: groupNamesByLeaderId.get(entry.profile.id) ?? [],
      careStatus: entry.care?.current_status ?? null,
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
