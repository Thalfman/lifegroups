import { describe, expect, it } from "vitest";
import {
  buildCareAccordion,
  buildNoteStateByLeaderId,
  countLeadersNeedingAttention,
  isNoteTransparencyGranted,
  resolveGroupGradeSeed,
  resolveGroupHealthByGroupId,
  resolveLeaderGradeSeed,
  resolveLeaderHealthByLeaderId,
  type CareAccordionGroupLeader,
  type CareAccordionNoteState,
  type GroupHealthGradeInput,
  type LeaderHealthGradeInput,
} from "@/lib/admin/care-accordion";
import type { GroupsRow } from "@/types/database";
import type {
  GroupHealthLetter,
  LeaderHealthLetter,
  ShepherdCareStatus,
} from "@/types/enums";
import type { Rubric } from "@/lib/admin/health-rubric";
import type { ShepherdCareDirectoryEntry } from "@/lib/supabase/shepherd-care-directory-reads";
import type {
  ActiveShepherdCoverageAssignmentSummary,
  OverShepherdListRow,
} from "@/lib/supabase/shepherd-coverage-reads";

// #373 — the Care accordion model. Pure grouping of Leaders under their
// Over-Shepherd (coverage assignments are the backbone), with group-name
// resolution from active group_leaders + groups, an always-present Unassigned
// pane, and Leader Care Status passed straight through.

const TODAY = "2026-06-05";

function overShepherd(
  id: string,
  fullName: string,
  active = true
): OverShepherdListRow {
  return {
    id,
    full_name: fullName,
    email: `${id}@example.com`,
    phone: null,
    active,
    archived_at: active ? null : `${TODAY}T00:00:00Z`,
    created_at: `${TODAY}T00:00:00Z`,
    updated_at: `${TODAY}T00:00:00Z`,
  };
}

function assignment(
  leaderId: string,
  overShepherdId: string,
  overShepherdName: string
): ActiveShepherdCoverageAssignmentSummary {
  return {
    id: `asg-${leaderId}`,
    shepherd_profile_id: leaderId,
    over_shepherd_id: overShepherdId,
    assigned_at: `${TODAY}T00:00:00Z`,
    over_shepherd: {
      id: overShepherdId,
      full_name: overShepherdName,
      active: true,
    },
  };
}

function entry(
  id: string,
  fullName: string,
  status: ShepherdCareStatus | null,
  needsAttention = false
): ShepherdCareDirectoryEntry {
  return {
    profile: {
      id,
      full_name: fullName,
      email: `${id}@example.com`,
      role: "leader",
      status: "active",
    },
    care:
      status === null
        ? null
        : {
            id: `cp-${id}`,
            shepherd_profile_id: id,
            current_status: status,
            last_contact_at: null,
            next_touchpoint_due: null,
            archived_at: null,
            created_at: `${TODAY}T00:00:00Z`,
            updated_at: `${TODAY}T00:00:00Z`,
          },
    needs_attention: needsAttention,
  };
}

function group(
  id: string,
  name: string,
  lifecycle: GroupsRow["lifecycle_status"] = "active"
): GroupsRow {
  return { id, name, lifecycle_status: lifecycle } as GroupsRow;
}

function groupLeader(
  profileId: string,
  groupId: string
): CareAccordionGroupLeader {
  return { profile_id: profileId, group_id: groupId };
}

describe("buildCareAccordion", () => {
  it("groups Leaders under their covering Over-Shepherd", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [assignment("ldr-1", "os-1", "Olive Shepherd")],
      groupLeaders: [],
      groups: [],
      careEntries: [entry("ldr-1", "Lance Leader", "doing_well")],
    });

    const named = panes.find((p) => p.overShepherdId === "os-1");
    expect(named).toBeDefined();
    expect(named!.leaders.map((l) => l.profileId)).toEqual(["ldr-1"]);
  });

  it("resolves active group names for each Leader", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [assignment("ldr-1", "os-1", "Olive Shepherd")],
      groupLeaders: [groupLeader("ldr-1", "g-2"), groupLeader("ldr-1", "g-1")],
      groups: [group("g-1", "Alpha Group"), group("g-2", "Beta Group")],
      careEntries: [entry("ldr-1", "Lance Leader", "doing_well")],
    });

    const leader = panes.find((p) => p.overShepherdId === "os-1")!.leaders[0]!;
    // De-duped, name-sorted.
    expect(leader.groupNames).toEqual(["Alpha Group", "Beta Group"]);
  });

  it("excludes closed (non-active) groups from a Leader's group names", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [assignment("ldr-1", "os-1", "Olive Shepherd")],
      groupLeaders: [groupLeader("ldr-1", "g-closed")],
      groups: [group("g-closed", "Closed Group", "closed")],
      careEntries: [entry("ldr-1", "Lance Leader", "doing_well")],
    });

    const leader = panes.find((p) => p.overShepherdId === "os-1")!.leaders[0]!;
    expect(leader.groupNames).toEqual([]);
  });

  it("puts Leaders with no active coverage in the Unassigned pane", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [],
      groupLeaders: [],
      groups: [],
      careEntries: [entry("ldr-x", "Una Assigned", "needs_follow_up")],
    });

    const unassigned = panes.find((p) => p.isUnassigned);
    expect(unassigned).toBeDefined();
    expect(unassigned!.overShepherdId).toBeNull();
    expect(unassigned!.leaders.map((l) => l.profileId)).toEqual(["ldr-x"]);
  });

  it("always emits an Unassigned pane, last, even with no unassigned Leaders", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [assignment("ldr-1", "os-1", "Olive Shepherd")],
      groupLeaders: [],
      groups: [],
      careEntries: [entry("ldr-1", "Lance Leader", "doing_well")],
    });

    const last = panes[panes.length - 1]!;
    expect(last.isUnassigned).toBe(true);
    expect(last.leaders).toEqual([]);
  });

  it("threads each Leader's needs-attention flag through from the directory entry", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [
        assignment("ldr-1", "os-1", "Olive Shepherd"),
        assignment("ldr-2", "os-1", "Olive Shepherd"),
      ],
      groupLeaders: [],
      groups: [],
      careEntries: [
        entry("ldr-1", "Flagged Fran", "needs_follow_up", true),
        entry("ldr-2", "Steady Sam", "doing_well", false),
      ],
    });

    const leaders = panes.find((p) => p.overShepherdId === "os-1")!.leaders;
    const byId = new Map(leaders.map((l) => [l.profileId, l.needsAttention]));
    expect(byId.get("ldr-1")).toBe(true);
    expect(byId.get("ldr-2")).toBe(false);
    expect(countLeadersNeedingAttention(leaders)).toBe(1);
  });

  it("passes Leader Care Status straight through (null when no care profile)", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [
        assignment("ldr-1", "os-1", "Olive Shepherd"),
        assignment("ldr-2", "os-1", "Olive Shepherd"),
      ],
      groupLeaders: [],
      groups: [],
      careEntries: [
        entry("ldr-1", "Concerned Carol", "concern"),
        entry("ldr-2", "New Ned", null),
      ],
    });

    const leaders = panes.find((p) => p.overShepherdId === "os-1")!.leaders;
    const byId = new Map(leaders.map((l) => [l.profileId, l.careStatus]));
    expect(byId.get("ldr-1")).toBe("concern");
    expect(byId.get("ldr-2")).toBeNull();
  });

  it("seeds an empty pane for an active Over-Shepherd with no covered Leaders", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-empty", "Empty Ed")],
      assignments: [],
      groupLeaders: [],
      groups: [],
      careEntries: [],
    });

    const pane = panes.find((p) => p.overShepherdId === "os-empty");
    expect(pane).toBeDefined();
    expect(pane!.leaders).toEqual([]);
  });

  it("excludes archived Over-Shepherds and treats their Leaders as unassigned", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-old", "Archie Archived", false)],
      assignments: [assignment("ldr-1", "os-old", "Archie Archived")],
      groupLeaders: [],
      groups: [],
      careEntries: [entry("ldr-1", "Lance Leader", "doing_well")],
    });

    expect(panes.find((p) => p.overShepherdId === "os-old")).toBeUndefined();
    const unassigned = panes.find((p) => p.isUnassigned)!;
    expect(unassigned.leaders.map((l) => l.profileId)).toEqual(["ldr-1"]);
  });

  it("sorts named panes by name with Unassigned last, and Leaders by name", () => {
    const panes = buildCareAccordion({
      overShepherds: [
        overShepherd("os-z", "Zara Shepherd"),
        overShepherd("os-a", "Aaron Shepherd"),
      ],
      assignments: [
        assignment("ldr-2", "os-a", "Aaron Shepherd"),
        assignment("ldr-1", "os-a", "Aaron Shepherd"),
      ],
      groupLeaders: [],
      groups: [],
      careEntries: [
        entry("ldr-1", "Zeb Leader", "doing_well"),
        entry("ldr-2", "Abe Leader", "doing_well"),
      ],
    });

    expect(panes.map((p) => p.overShepherdName)).toEqual([
      "Aaron Shepherd",
      "Zara Shepherd",
      "Unassigned",
    ]);
    const aaron = panes.find((p) => p.overShepherdId === "os-a")!;
    expect(aaron.leaders.map((l) => l.fullName)).toEqual([
      "Abe Leader",
      "Zeb Leader",
    ]);
  });

  // #377/#378/#381 — the formerly-placeholder slots, now filled from enrichment.
  it("defaults to ungraded / sealed when no enrichment maps are passed", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [assignment("ldr-1", "os-1", "Olive Shepherd")],
      groupLeaders: [groupLeader("ldr-1", "g-1")],
      groups: [group("g-1", "Alpha Group")],
      careEntries: [entry("ldr-1", "Lance Leader", "doing_well")],
    });

    const leader = panes.find((p) => p.overShepherdId === "os-1")!.leaders[0]!;
    expect(leader.leaderHealthGrade).toBeNull();
    expect(leader.ledGroups).toEqual([
      { id: "g-1", name: "Alpha Group", healthGrade: null },
    ]);
    expect(leader.notes).toEqual<CareAccordionNoteState>({
      transparency: "sealed",
      careNoteCount: 0,
      prayerCount: 0,
    });
  });

  it("fills grade + note slots from the enrichment maps", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [assignment("ldr-1", "os-1", "Olive Shepherd")],
      groupLeaders: [groupLeader("ldr-1", "g-1")],
      groups: [group("g-1", "Alpha Group")],
      careEntries: [entry("ldr-1", "Lance Leader", "needs_follow_up")],
      leaderHealthByLeaderId: new Map<string, LeaderHealthLetter | null>([
        ["ldr-1", "B"],
      ]),
      groupHealthByGroupId: new Map<string, GroupHealthLetter | null>([
        ["g-1", "C"],
      ]),
      noteStateByLeaderId: new Map<string, CareAccordionNoteState>([
        [
          "ldr-1",
          { transparency: "visible", careNoteCount: 2, prayerCount: 1 },
        ],
      ]),
    });

    const leader = panes.find((p) => p.overShepherdId === "os-1")!.leaders[0]!;
    expect(leader.leaderHealthGrade).toBe("B");
    expect(leader.ledGroups[0]!.healthGrade).toBe("C");
    expect(leader.notes.transparency).toBe("visible");
    expect(leader.notes.careNoteCount).toBe(2);
    expect(leader.notes.prayerCount).toBe(1);
  });
});

const ONE_CRITERION_RUBRIC: Rubric = {
  criteria: [{ key: "k1", label: "Criterion 1", weight: 100 }],
};
const PERIOD = "2026-02-01"; // Feb 2026 — inside ministry year 2025 (Aug–May).

describe("resolveLeaderHealthByLeaderId", () => {
  it("resolves the computed letter from scores", () => {
    const rows: LeaderHealthGradeInput[] = [
      {
        profile_id: "ldr-1",
        criterion_scores: { k1: 95 },
        override_letter: null,
        override_scope: null,
        override_period_month: null,
      },
    ];
    const map = resolveLeaderHealthByLeaderId(
      rows,
      ONE_CRITERION_RUBRIC,
      2025,
      PERIOD
    );
    expect(map.get("ldr-1")).toBe("A");
  });

  it("an until_cleared override forces the letter over the computed band", () => {
    const rows: LeaderHealthGradeInput[] = [
      {
        profile_id: "ldr-1",
        criterion_scores: { k1: 95 }, // computes to A
        override_letter: "D",
        override_scope: "until_cleared",
        override_period_month: null,
      },
    ];
    const map = resolveLeaderHealthByLeaderId(
      rows,
      ONE_CRITERION_RUBRIC,
      2025,
      PERIOD
    );
    expect(map.get("ldr-1")).toBe("D");
  });
});

describe("resolveGroupHealthByGroupId", () => {
  it("resolves the computed letter from scores", () => {
    const rows: GroupHealthGradeInput[] = [
      {
        group_id: "g-1",
        criterion_scores: { k1: 72 },
        override_letter: null,
        override_scope: null,
        override_period_month: null,
      },
    ];
    const map = resolveGroupHealthByGroupId(rows, ONE_CRITERION_RUBRIC, PERIOD);
    expect(map.get("g-1")).toBe("C"); // 72 is in the 70–79 band
  });
});

describe("buildNoteStateByLeaderId", () => {
  it("marks granted leaders visible and counts their notes/prayers", () => {
    const map = buildNoteStateByLeaderId({
      grantedSubjectIds: ["ldr-1", "ldr-2"],
      careNoteSubjectIds: ["ldr-1", "ldr-1", "ldr-2"],
      prayerSubjectIds: ["ldr-1"],
    });
    expect(map.get("ldr-1")).toEqual<CareAccordionNoteState>({
      transparency: "visible",
      careNoteCount: 2,
      prayerCount: 1,
    });
    // Granted but no notes yet → visible with zero counts.
    expect(map.get("ldr-2")).toEqual<CareAccordionNoteState>({
      transparency: "visible",
      careNoteCount: 1,
      prayerCount: 0,
    });
  });

  it("keeps a sealed leader sealed when the viewer reads only their OWN authored rows (ADR 0023)", () => {
    // Admins author notes now, and the author RLS arm returns those rows while
    // the subject's grant is still off. Readable rows must NOT flip the toggle
    // to "on" — that would make granting from the panel impossible and label
    // author-only counts as leadership visibility.
    const map = buildNoteStateByLeaderId({
      grantedSubjectIds: [],
      careNoteSubjectIds: ["ldr-1"],
      prayerSubjectIds: ["ldr-1", "ldr-1"],
    });
    const state = map.get("ldr-1")!;
    expect(state.transparency).toBe("sealed");
    expect(isNoteTransparencyGranted(state)).toBe(false);
    // Counts are still tallied; the panel hides them while sealed.
    expect(state.careNoteCount).toBe(1);
    expect(state.prayerCount).toBe(2);
  });

  it("omits leaders with no grant and no readable notes (default sealed)", () => {
    const map = buildNoteStateByLeaderId({
      grantedSubjectIds: [],
      careNoteSubjectIds: [],
      prayerSubjectIds: [],
    });
    expect(map.size).toBe(0);
  });
});

// #546 — characterize the count-visibility contract BEFORE any aggregation.
// buildNoteStateByLeaderId is the SOLE place per-leader Care Note / Prayer
// Request counts are derived, and its subject-id inputs are already RLS-scoped:
// the reads layer (care-accordion-reads.ts) only ever hands it the
// subject_profile_id of rows THIS viewer may read. These tests pin that
// boundary so a later count aggregate (e.g. a SECURITY DEFINER count RPC)
// cannot quietly leak sealed notes, admin Private Care Notes, or another
// author's sealed rows — it must re-encode the same readable-only semantics.
describe("buildNoteStateByLeaderId — count-visibility contract (#546)", () => {
  it("counts only the readable rows handed in; an unreadable row (absent id) never inflates", () => {
    // The viewer may read two of ldr-1's care notes; a third, sealed to a
    // different author, was stripped by RLS upstream so its id is simply not
    // in the input — and therefore cannot raise the count past the readable 2.
    const map = buildNoteStateByLeaderId({
      grantedSubjectIds: ["ldr-1"],
      careNoteSubjectIds: ["ldr-1", "ldr-1"],
      prayerSubjectIds: ["ldr-1"],
    });
    const state = map.get("ldr-1")!;
    expect(state.careNoteCount).toBe(2);
    expect(state.prayerCount).toBe(1);
  });

  it("an entirely-unreadable subject contributes nothing — no phantom leader, no count", () => {
    // ldr-2 has notes, but none readable to this viewer and no grant, so the
    // builder never hears about ldr-2 and cannot leak a count for them.
    const map = buildNoteStateByLeaderId({
      grantedSubjectIds: ["ldr-1"],
      careNoteSubjectIds: ["ldr-1"],
      prayerSubjectIds: [],
    });
    expect(map.has("ldr-2")).toBe(false);
    expect(map.get("ldr-1")!.careNoteCount).toBe(1);
  });

  it("visibility tracks the grant, not row readability", () => {
    const map = buildNoteStateByLeaderId({
      grantedSubjectIds: ["granted"],
      // "sealed" has readable (e.g. admin-authored) rows but no grant.
      careNoteSubjectIds: ["sealed", "sealed"],
      prayerSubjectIds: [],
    });
    // Granted leader is visible even with zero readable rows.
    expect(map.get("granted")).toEqual<CareAccordionNoteState>({
      transparency: "visible",
      careNoteCount: 0,
      prayerCount: 0,
    });
    // Readable-but-ungranted leader stays sealed; counts are still tallied,
    // but the panel keeps them hidden until the transparency toggle flips.
    const sealed = map.get("sealed")!;
    expect(sealed.transparency).toBe("sealed");
    expect(sealed.careNoteCount).toBe(2);
  });
});

// #467 — the inline transparency toggle in the accordion renders from the
// model's note state: granted (toggle "on", counts shown) vs sealed (toggle
// "off"). isNoteTransparencyGranted is the single mapping the panel uses.
describe("isNoteTransparencyGranted", () => {
  it("maps visible → granted, sealed → not granted", () => {
    expect(
      isNoteTransparencyGranted({
        transparency: "visible",
        careNoteCount: 2,
        prayerCount: 1,
      })
    ).toBe(true);
    expect(
      isNoteTransparencyGranted({
        transparency: "sealed",
        careNoteCount: 0,
        prayerCount: 0,
      })
    ).toBe(false);
  });

  it("a granted Leader with zero notes still reads granted (toggle on, zero counts)", () => {
    const map = buildNoteStateByLeaderId({
      grantedSubjectIds: ["ldr-1"],
      careNoteSubjectIds: [],
      prayerSubjectIds: [],
    });
    const state = map.get("ldr-1")!;
    expect(isNoteTransparencyGranted(state)).toBe(true);
    expect(state.careNoteCount).toBe(0);
    expect(state.prayerCount).toBe(0);
  });

  it("the accordion's default (no enrichment) state drives a sealed toggle", () => {
    const panes = buildCareAccordion({
      overShepherds: [overShepherd("os-1", "Olive Shepherd")],
      assignments: [assignment("ldr-1", "os-1", "Olive Shepherd")],
      groupLeaders: [],
      groups: [],
      careEntries: [entry("ldr-1", "Lance Leader", "doing_well")],
    });
    const leader = panes.find((p) => p.overShepherdId === "os-1")!.leaders[0]!;
    // The panel feeds these two straight into NoteTransparencyToggle.
    expect(leader.profileId).toBe("ldr-1");
    expect(isNoteTransparencyGranted(leader.notes)).toBe(false);
  });
});

// ADR 0023 — the inline editors' seeds: persisted scores plus the override
// ONLY while it is still live. An expired this-month override must not re-arm
// the editor's override selects (mirrors the detail page's resolution).
describe("resolveLeaderGradeSeed / resolveGroupGradeSeed", () => {
  it("returns an empty seed when the leader has no persisted grade", () => {
    expect(
      resolveLeaderGradeSeed(
        undefined,
        ONE_CRITERION_RUBRIC.criteria,
        2025,
        PERIOD
      )
    ).toEqual({ scores: {}, overrideLetter: null, overrideScope: null });
  });

  it("seeds scores and a live until_cleared override", () => {
    const seed = resolveLeaderGradeSeed(
      {
        profile_id: "ldr-1",
        criterion_scores: { k1: 95 },
        override_letter: "D",
        override_scope: "until_cleared",
        override_period_month: "2025-11-01",
      },
      ONE_CRITERION_RUBRIC.criteria,
      2025,
      PERIOD
    );
    expect(seed).toEqual({
      scores: { k1: 95 },
      overrideLetter: "D",
      overrideScope: "until_cleared",
    });
  });

  it("drops an expired this-month override from the seed", () => {
    const seed = resolveLeaderGradeSeed(
      {
        profile_id: "ldr-1",
        criterion_scores: { k1: 95 },
        override_letter: "D",
        override_scope: "this_month",
        override_period_month: "2025-11-01", // a past month — expired
      },
      ONE_CRITERION_RUBRIC.criteria,
      2025,
      PERIOD
    );
    expect(seed.scores).toEqual({ k1: 95 });
    expect(seed.overrideLetter).toBeNull();
    expect(seed.overrideScope).toBeNull();
  });

  it("group seed mirrors the same rules", () => {
    expect(
      resolveGroupGradeSeed(undefined, ONE_CRITERION_RUBRIC.criteria, PERIOD)
    ).toEqual({ scores: {}, overrideLetter: null, overrideScope: null });
    const live = resolveGroupGradeSeed(
      {
        group_id: "g-1",
        criterion_scores: { k1: 72 },
        override_letter: "A",
        override_scope: "this_month",
        override_period_month: PERIOD, // the current month — still live
      },
      ONE_CRITERION_RUBRIC.criteria,
      PERIOD
    );
    expect(live).toEqual({
      scores: { k1: 72 },
      overrideLetter: "A",
      overrideScope: "this_month",
    });
  });
});
