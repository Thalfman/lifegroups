import { describe, expect, it } from "vitest";
import {
  buildShepherdCareDashboardModel,
  countAllAttentionItems,
  resolveCareCoverageState,
  type CareAttentionReason,
  type CareDashboardSummary,
} from "@/lib/admin/shepherd-care-dashboard";
import type {
  ActiveShepherdCoverageAssignmentSummary,
  CareFollowUpDashboardRow,
  OverShepherdListRow,
  ShepherdCareDirectoryEntry,
  ShepherdCareRecentInteractionRow,
} from "@/lib/supabase/shepherd-care-reads";

const TODAY = "2026-05-22";
const STALE_OLD = "2026-01-01"; // ~141 days before TODAY -> stale
const RECENT = "2026-05-15"; // 7 days before TODAY -> fresh
const SOON = "2026-05-26"; // 4 days after TODAY -> upcoming touchpoint
const NEXT_WEEK_EDGE = "2026-05-29"; // exactly 7 days from TODAY -> included
const OUTSIDE_WINDOW = "2026-06-01"; // 10 days from TODAY -> outside upcoming window
const OVERDUE = "2026-05-10"; // 12 days before TODAY -> overdue touchpoint

const UUID_1 = "11111111-1111-1111-1111-111111111111";
const UUID_2 = "22222222-2222-2222-2222-222222222222";
const UUID_3 = "33333333-3333-3333-3333-333333333333";
const UUID_4 = "44444444-4444-4444-4444-444444444444";
const UUID_5 = "55555555-5555-5555-5555-555555555555";
const UUID_6 = "66666666-6666-6666-6666-666666666666";
const OS_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OS_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function entry(
  id: string,
  name: string,
  care: ShepherdCareDirectoryEntry["care"]
): ShepherdCareDirectoryEntry {
  // computeNeedsAttention is exercised by the directory read-model tests
  // already; for the builder unit tests we set it explicitly so the
  // expectation is visible inline.
  const todayBeats =
    care === null ||
    care.last_contact_at === null ||
    (care.next_touchpoint_due !== null && care.next_touchpoint_due < TODAY) ||
    (care.last_contact_at !== null && care.last_contact_at < STALE_OLD);
  return {
    profile: {
      id,
      full_name: name,
      email: `${name.replace(/\s+/g, ".").toLowerCase()}@example.com`,
      role: "leader",
      status: "active",
    },
    care,
    needs_attention: todayBeats,
  };
}

function careRow(
  shepherdId: string,
  opts: {
    status?: ShepherdCareDirectoryEntry["care"] extends infer T
      ? T extends { current_status: infer S }
        ? S
        : never
      : never;
    last?: string | null;
    next?: string | null;
  } = {}
): ShepherdCareDirectoryEntry["care"] {
  return {
    id: `care-${shepherdId}`,
    shepherd_profile_id: shepherdId,
    current_status: opts.status ?? "doing_well",
    last_contact_at: opts.last ?? null,
    next_touchpoint_due: opts.next ?? null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function assignment(
  shepherdId: string,
  overShepherdId: string
): ActiveShepherdCoverageAssignmentSummary {
  return {
    id: `assn-${shepherdId}`,
    shepherd_profile_id: shepherdId,
    over_shepherd_id: overShepherdId,
    assigned_at: "2026-04-01",
    over_shepherd: {
      id: overShepherdId,
      full_name: overShepherdId === OS_A ? "Coach A" : "Coach B",
      active: true,
    },
  };
}

function overShepherd(
  id: string,
  name: string,
  active = true
): OverShepherdListRow {
  return {
    id,
    full_name: name,
    email: null,
    phone: null,
    active,
    archived_at: active ? null : "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("buildShepherdCareDashboardModel", () => {
  it("returns all-zero counts and empty queues for empty inputs", () => {
    const model = buildShepherdCareDashboardModel({
      entries: [],
      assignments: [],
      overShepherds: [],
      recentInteractions: [],
      todayIso: TODAY,
    });
    expect(model.summary).toEqual({
      totalActiveShepherds: 0,
      needsAttention: 0,
      overdueTouchpoints: 0,
      notContactedRecently: 0,
      noCareProfile: 0,
      unassignedCoverage: 0,
      overdueFollowUps: 0,
      outstandingFollowUps: 0,
    });
    expect(model.attentionQueue).toEqual([]);
    expect(model.upcomingTouchpoints).toEqual([]);
    expect(model.recentInteractions).toEqual([]);
    // Coverage buckets always include the Unassigned tile, even when empty.
    expect(model.coverageBuckets).toHaveLength(1);
    expect(model.coverageBuckets[0].isUnassigned).toBe(true);
    expect(model.coverageBuckets[0].shepherdCount).toBe(0);
    expect(model.coverageAvailable).toBe(true);
    expect(model.followUpsAvailable).toBe(true);
  });

  it("suppresses coverage-derived sections when assignmentsAvailable is false", () => {
    // Simulates a transient failure on the active-coverage read: the page
    // passes assignments=[] (the safe fallback) AND assignmentsAvailable=false.
    // The builder must NOT report every shepherd as unassigned.
    const entries = [
      entry(UUID_1, "Anna One", careRow(UUID_1, { last: RECENT })),
      entry(UUID_2, "Beth Two", careRow(UUID_2, { last: RECENT })),
    ];
    const model = buildShepherdCareDashboardModel({
      entries,
      assignments: [],
      overShepherds: [overShepherd(OS_A, "Coach A")],
      recentInteractions: [],
      todayIso: TODAY,
      assignmentsAvailable: false,
    });
    expect(model.coverageAvailable).toBe(false);
    expect(model.summary.unassignedCoverage).toBe(0);
    expect(model.coverageBuckets).toEqual([]);
    // No no_over_shepherd reasons should be injected. The two shepherds are
    // otherwise healthy/recent so the queue is empty.
    expect(model.attentionQueue).toEqual([]);
    expect(
      countAllAttentionItems(entries, [], TODAY, { coverageAvailable: false })
    ).toBe(0);
  });

  it("counts unassigned coverage and surfaces no_over_shepherd reasons", () => {
    const entries = [
      entry(UUID_1, "Anna One", careRow(UUID_1, { last: RECENT })),
      entry(UUID_2, "Beth Two", careRow(UUID_2, { last: RECENT })),
    ];
    const model = buildShepherdCareDashboardModel({
      entries,
      assignments: [],
      overShepherds: [overShepherd(OS_A, "Coach A")],
      recentInteractions: [],
      todayIso: TODAY,
    });
    expect(model.summary.unassignedCoverage).toBe(2);
    // Both shepherds are healthy and recent, so the only reason is
    // no_over_shepherd, which puts them in the queue.
    expect(model.attentionQueue).toHaveLength(2);
    expect(
      model.attentionQueue.every((i) => i.reason === "no_over_shepherd")
    ).toBe(true);
    const unassignedBucket = model.coverageBuckets.find((b) => b.isUnassigned)!;
    expect(unassignedBucket.shepherdCount).toBe(2);
    // Coverage tiles are triage entry points: they link into the Directory
    // view with the coverage filter pre-applied (#180), on the canonical Care
    // page (#468).
    expect(unassignedBucket.href).toBe(
      "/admin/care?view=directory&coverage=unassigned"
    );
    const coachBucket = model.coverageBuckets.find(
      (b) => b.overShepherdId === OS_A
    )!;
    expect(coachBucket.shepherdCount).toBe(0);
    expect(coachBucket.href).toBe(
      `/admin/care?view=directory&coverage=${OS_A}`
    );
  });

  it("orders attention queue by reason priority then name", () => {
    // One shepherd per reason; all assigned to a coach so no_over_shepherd
    // does not fire as a side reason for the higher-priority cases.
    const entries = [
      // overdue_touchpoint (also stale, ensures primary wins)
      entry(
        UUID_1,
        "A Overdue",
        careRow(UUID_1, { next: OVERDUE, last: STALE_OLD })
      ),
      // needs_follow_up_status only
      entry(
        UUID_2,
        "B Status",
        careRow(UUID_2, { status: "needs_follow_up", last: RECENT })
      ),
      // no_contact_yet (care row exists but last_contact_at null)
      entry(UUID_3, "C NoContact", careRow(UUID_3, { last: null })),
      // stale_last_contact only
      entry(UUID_4, "D Stale", careRow(UUID_4, { last: STALE_OLD })),
      // no_over_shepherd: unassigned and otherwise doing_well/recent
      entry(UUID_5, "E Unassigned", careRow(UUID_5, { last: RECENT })),
      // needs_encouragement_status
      entry(
        UUID_6,
        "F Encouragement",
        careRow(UUID_6, { status: "needs_encouragement", last: RECENT })
      ),
    ];
    const assignments = [
      assignment(UUID_1, OS_A),
      assignment(UUID_2, OS_A),
      assignment(UUID_3, OS_A),
      assignment(UUID_4, OS_A),
      // UUID_5 intentionally unassigned
      assignment(UUID_6, OS_A),
    ];

    const model = buildShepherdCareDashboardModel({
      entries,
      assignments,
      overShepherds: [overShepherd(OS_A, "Coach A")],
      recentInteractions: [],
      todayIso: TODAY,
      limits: { attention: 100 },
    });

    const reasons = model.attentionQueue.map((i) => i.reason);
    expect(reasons).toEqual<CareAttentionReason[]>([
      "overdue_touchpoint",
      "needs_follow_up_status",
      "no_contact_yet",
      "stale_last_contact",
      "no_over_shepherd",
      "needs_encouragement_status",
    ]);
  });

  it("captures secondary reasons when multiple fire", () => {
    const entries = [
      entry(
        UUID_1,
        "Multi",
        careRow(UUID_1, {
          status: "needs_follow_up",
          next: OVERDUE,
          last: STALE_OLD,
        })
      ),
    ];
    const model = buildShepherdCareDashboardModel({
      entries,
      assignments: [],
      overShepherds: [],
      recentInteractions: [],
      todayIso: TODAY,
    });
    expect(model.attentionQueue).toHaveLength(1);
    const item = model.attentionQueue[0];
    expect(item.reason).toBe("overdue_touchpoint");
    expect(item.secondaryReasons).toEqual([
      "needs_follow_up_status",
      "stale_last_contact",
      "no_over_shepherd",
    ]);
  });

  it("counts each summary card independently", () => {
    const entries = [
      // overdue AND stale AND unassigned -> counts in three cards once each
      entry(UUID_1, "X", careRow(UUID_1, { next: OVERDUE, last: STALE_OLD })),
      // no care profile and unassigned
      entry(UUID_2, "Y", null),
    ];
    const model = buildShepherdCareDashboardModel({
      entries,
      assignments: [],
      overShepherds: [],
      recentInteractions: [],
      todayIso: TODAY,
    });
    expect(model.summary.totalActiveShepherds).toBe(2);
    expect(model.summary.overdueTouchpoints).toBe(1);
    expect(model.summary.notContactedRecently).toBe(1);
    expect(model.summary.noCareProfile).toBe(1);
    expect(model.summary.unassignedCoverage).toBe(2);
    // Both entries are flagged needs_attention (one for overdue+stale, one for no profile).
    expect(model.summary.needsAttention).toBe(2);
  });

  it("includes overdue and through today+7 in upcoming touchpoints, sorted asc", () => {
    const entries = [
      entry(UUID_1, "A", careRow(UUID_1, { next: SOON, last: RECENT })),
      entry(UUID_2, "B", careRow(UUID_2, { next: OVERDUE, last: RECENT })),
      entry(
        UUID_3,
        "C",
        careRow(UUID_3, { next: NEXT_WEEK_EDGE, last: RECENT })
      ),
      entry(
        UUID_4,
        "D",
        careRow(UUID_4, { next: OUTSIDE_WINDOW, last: RECENT })
      ),
      entry(UUID_5, "E", careRow(UUID_5, { next: null, last: RECENT })),
    ];
    const model = buildShepherdCareDashboardModel({
      entries,
      assignments: [
        assignment(UUID_1, OS_A),
        assignment(UUID_2, OS_A),
        assignment(UUID_3, OS_A),
        assignment(UUID_4, OS_A),
        assignment(UUID_5, OS_A),
      ],
      overShepherds: [overShepherd(OS_A, "Coach A")],
      recentInteractions: [],
      todayIso: TODAY,
    });
    const ids = model.upcomingTouchpoints.map((t) => t.shepherdProfileId);
    // OVERDUE first, then SOON, then edge of window. OUTSIDE_WINDOW and null excluded.
    expect(ids).toEqual([UUID_2, UUID_1, UUID_3]);
    expect(model.upcomingTouchpoints[0].relativeLabel).toMatch(/Overdue/);
    expect(model.upcomingTouchpoints[1].relativeLabel).toMatch(/Due in 4 days/);
    expect(model.upcomingTouchpoints[2].relativeLabel).toMatch(/Due in 7 days/);
  });

  it("sorts recent interactions desc by interaction_at then created_at, caps at limit", () => {
    const rows: ShepherdCareRecentInteractionRow[] = [
      {
        id: "i1",
        care_profile_id: "cp1",
        interaction_at: "2026-05-20",
        interaction_type: "call",
        created_at: "2026-05-20T10:00:00Z",
        shepherd_profile_id: UUID_1,
        shepherd_full_name: "Anna One",
      },
      {
        id: "i2",
        care_profile_id: "cp2",
        interaction_at: "2026-05-21",
        interaction_type: "text",
        created_at: "2026-05-21T10:00:00Z",
        shepherd_profile_id: UUID_2,
        shepherd_full_name: "Beth Two",
      },
      {
        id: "i3",
        care_profile_id: "cp2",
        interaction_at: "2026-05-21",
        interaction_type: "meeting",
        created_at: "2026-05-21T12:00:00Z",
        shepherd_profile_id: UUID_2,
        shepherd_full_name: "Beth Two",
      },
    ];
    const model = buildShepherdCareDashboardModel({
      entries: [],
      assignments: [],
      overShepherds: [],
      recentInteractions: rows,
      todayIso: TODAY,
      limits: { recent: 2 },
    });
    expect(model.recentInteractions.map((r) => r.id)).toEqual(["i3", "i2"]);
    // Each row carries an href into the shepherd's detail page.
    expect(model.recentInteractions[0].href).toBe(
      `/admin/shepherd-care/${UUID_2}`
    );
  });

  it("does not leak notes or admin_summary into the serialized model", () => {
    // Even if upstream inputs accidentally carried sensitive text fields, the
    // builder's output type has no place to put them. This is a runtime guard
    // on top of the TS guarantee.
    const entries = [
      entry(
        UUID_1,
        "Secret Holder",
        // Cast through unknown to attach fields the type doesn't expose; if
        // the builder ever started spreading the care row, this would catch it.
        {
          ...(careRow(UUID_1, { last: RECENT }) as object),
          admin_summary: "SECRET ADMIN SUMMARY BODY",
        } as unknown as ShepherdCareDirectoryEntry["care"]
      ),
    ];
    const interactions = [
      {
        id: "i1",
        care_profile_id: "cp1",
        interaction_at: "2026-05-20",
        interaction_type: "call",
        created_at: "2026-05-20T10:00:00Z",
        shepherd_profile_id: UUID_1,
        shepherd_full_name: "Anna One",
        notes: "SECRET INTERACTION NOTES",
      } as unknown as ShepherdCareRecentInteractionRow,
    ];

    const model = buildShepherdCareDashboardModel({
      entries,
      assignments: [assignment(UUID_1, OS_A)],
      overShepherds: [overShepherd(OS_A, "Coach A")],
      recentInteractions: interactions,
      todayIso: TODAY,
    });
    const serialized = JSON.stringify(model);
    expect(serialized).not.toMatch(/SECRET ADMIN SUMMARY BODY/);
    expect(serialized).not.toMatch(/SECRET INTERACTION NOTES/);
    expect(serialized).not.toMatch(/admin_summary/);
    expect(serialized).not.toMatch(/"notes"/);
  });

  it("caps the visible queue and exposes the full count via countAllAttentionItems", () => {
    const entries = Array.from({ length: 12 }).map((_, i) =>
      entry(
        `11111111-1111-1111-1111-${String(i).padStart(12, "0")}`,
        `Shepherd ${String(i).padStart(2, "0")}`,
        careRow(`11111111-1111-1111-1111-${String(i).padStart(12, "0")}`, {
          status: "needs_follow_up",
          last: RECENT,
        })
      )
    );
    const model = buildShepherdCareDashboardModel({
      entries,
      assignments: [],
      overShepherds: [],
      recentInteractions: [],
      todayIso: TODAY,
      limits: { attention: 6 },
    });
    expect(model.attentionQueue).toHaveLength(6);
    expect(countAllAttentionItems(entries, [], TODAY)).toBe(12);
  });

  // Julian Q5: the stale-contact window is keyed by coverage tier. A shepherd
  // last contacted 40 days ago is fresh under the 60-day delegated window but
  // stale under the 30-day directly-overseen window.
  describe("per-tier staleness windows (Julian Q5)", () => {
    const FORTY_DAYS_AGO = "2026-04-12"; // 40 days before TODAY (2026-05-22)

    it("does not flag a delegated shepherd at 40 days (60-day window)", () => {
      // An active over-shepherd assignment -> delegated tier -> 60-day window.
      const entries = [
        entry(UUID_1, "Anna One", careRow(UUID_1, { last: FORTY_DAYS_AGO })),
      ];
      const assignments = [assignment(UUID_1, OS_A)];
      const model = buildShepherdCareDashboardModel({
        entries,
        assignments,
        overShepherds: [overShepherd(OS_A, "Coach A")],
        recentInteractions: [],
        todayIso: TODAY,
      });
      expect(model.summary.notContactedRecently).toBe(0);
      expect(model.attentionQueue).toEqual([]);
      expect(countAllAttentionItems(entries, assignments, TODAY)).toBe(0);
    });

    it("flags a directly-overseen shepherd at 40 days (30-day window)", () => {
      // No coverage assignment -> directly overseen -> 30-day window -> stale.
      const entries = [
        entry(UUID_1, "Anna One", careRow(UUID_1, { last: FORTY_DAYS_AGO })),
      ];
      const model = buildShepherdCareDashboardModel({
        entries,
        assignments: [],
        overShepherds: [],
        recentInteractions: [],
        todayIso: TODAY,
      });
      expect(model.summary.notContactedRecently).toBe(1);
      // stale_last_contact (priority 5) outranks no_over_shepherd (6), which
      // also fires for an unassigned shepherd.
      expect(model.attentionQueue[0].reason).toBe<CareAttentionReason>(
        "stale_last_contact"
      );
      expect(model.attentionQueue[0].detail).toBe("Last contact 40 days ago");
      expect(model.attentionQueue[0].secondaryReasons).toContain(
        "no_over_shepherd"
      );
      expect(countAllAttentionItems(entries, [], TODAY)).toBe(1);
    });

    it("honours configured windows over the 30 / 60 defaults", () => {
      // Widen the directly-overseen window to 50 so 40 days is fresh again.
      const entries = [
        entry(UUID_1, "Anna One", careRow(UUID_1, { last: FORTY_DAYS_AGO })),
      ];
      const windows = {
        directlyOverseenStaleDays: 50,
        delegatedStaleDays: 60,
      };
      const model = buildShepherdCareDashboardModel({
        entries,
        assignments: [],
        overShepherds: [],
        recentInteractions: [],
        todayIso: TODAY,
        windows,
      });
      // The widened window means staleness no longer fires; the only remaining
      // reason is the unrelated no_over_shepherd (the shepherd is unassigned).
      expect(model.summary.notContactedRecently).toBe(0);
      const reasons = model.attentionQueue.flatMap((i) => [
        i.reason,
        ...i.secondaryReasons,
      ]);
      expect(reasons).not.toContain("stale_last_contact");
      expect(reasons).toContain("no_over_shepherd");
    });
  });

  // #649: the three coverage states the Care summary distinguishes, so a fresh
  // system reads as "not active yet" rather than vacuous success.
  describe("resolveCareCoverageState", () => {
    function summary(
      overrides: Partial<CareDashboardSummary> = {}
    ): CareDashboardSummary {
      return {
        totalActiveShepherds: 0,
        needsAttention: 0,
        overdueTouchpoints: 0,
        notContactedRecently: 0,
        noCareProfile: 0,
        unassignedCoverage: 0,
        overdueFollowUps: 0,
        outstandingFollowUps: 0,
        ...overrides,
      };
    }

    it("is not_active when there are no active leaders", () => {
      expect(
        resolveCareCoverageState(summary(), { coverageAvailable: true })
      ).toBe("not_active");
      // Outstanding gaps are vacuous with zero leaders, so it stays not_active.
      expect(
        resolveCareCoverageState(summary({ unassignedCoverage: 3 }), {
          coverageAvailable: true,
        })
      ).toBe("not_active");
    });

    it("is caught_up when leaders exist and nothing needs attention", () => {
      expect(
        resolveCareCoverageState(summary({ totalActiveShepherds: 4 }), {
          coverageAvailable: true,
        })
      ).toBe("caught_up");
    });

    it("is active_with_gaps when leaders exist and a gap is present", () => {
      expect(
        resolveCareCoverageState(
          summary({ totalActiveShepherds: 4, needsAttention: 1 }),
          { coverageAvailable: true }
        )
      ).toBe("active_with_gaps");
      expect(
        resolveCareCoverageState(
          summary({ totalActiveShepherds: 4, unassignedCoverage: 2 }),
          { coverageAvailable: true }
        )
      ).toBe("active_with_gaps");
    });

    it("does not treat unassigned coverage as a gap when the read is unavailable", () => {
      // A failed coverage read is "unknown", not "everyone unassigned".
      expect(
        resolveCareCoverageState(
          summary({ totalActiveShepherds: 4, unassignedCoverage: 4 }),
          { coverageAvailable: false }
        )
      ).toBe("caught_up");
    });
  });

  // SC.1B: outstanding care follow-ups feed the dashboard. The careRow helper
  // ids care profiles as `care-<shepherdId>`, so a follow-up's care_profile_id
  // joins back to a shepherd through that id.
  describe("care follow-up integration", () => {
    function followUp(
      shepherdId: string,
      status: CareFollowUpDashboardRow["status"],
      due: string | null
    ): CareFollowUpDashboardRow {
      return {
        id: `fu-${shepherdId}-${due ?? "none"}`,
        care_profile_id: `care-${shepherdId}`,
        status,
        due_date: due,
      };
    }

    it("surfaces an overdue_care_follow_up reason and counts overdue/outstanding", () => {
      const entries = [
        entry(UUID_1, "Anna One", careRow(UUID_1, { last: RECENT })),
      ];
      const model = buildShepherdCareDashboardModel({
        entries,
        assignments: [assignment(UUID_1, OS_A)],
        overShepherds: [overShepherd(OS_A, "Coach A")],
        recentInteractions: [],
        careFollowUps: [
          followUp(UUID_1, "open", OVERDUE),
          followUp(UUID_1, "in_progress", SOON),
        ],
        todayIso: TODAY,
      });
      expect(model.summary.overdueFollowUps).toBe(1);
      expect(model.summary.outstandingFollowUps).toBe(2);
      expect(model.attentionQueue).toHaveLength(1);
      expect(model.attentionQueue[0].reason).toBe<CareAttentionReason>(
        "overdue_care_follow_up"
      );
      expect(model.attentionQueue[0].detail).toBe("1 follow-up overdue");
    });

    it("pluralizes the overdue detail string", () => {
      const entries = [
        entry(UUID_1, "Anna One", careRow(UUID_1, { last: RECENT })),
      ];
      const model = buildShepherdCareDashboardModel({
        entries,
        assignments: [assignment(UUID_1, OS_A)],
        overShepherds: [overShepherd(OS_A, "Coach A")],
        recentInteractions: [],
        careFollowUps: [
          followUp(UUID_1, "open", OVERDUE),
          followUp(UUID_1, "in_progress", STALE_OLD),
        ],
        todayIso: TODAY,
      });
      expect(model.summary.overdueFollowUps).toBe(2);
      expect(model.attentionQueue[0].detail).toBe("2 follow-ups overdue");
    });

    it("counts a non-overdue open follow-up as outstanding without an attention reason", () => {
      const entries = [
        entry(UUID_1, "Anna One", careRow(UUID_1, { last: RECENT })),
      ];
      const model = buildShepherdCareDashboardModel({
        entries,
        assignments: [assignment(UUID_1, OS_A)],
        overShepherds: [overShepherd(OS_A, "Coach A")],
        recentInteractions: [],
        careFollowUps: [followUp(UUID_1, "open", SOON)],
        todayIso: TODAY,
      });
      expect(model.summary.overdueFollowUps).toBe(0);
      expect(model.summary.outstandingFollowUps).toBe(1);
      // Otherwise healthy + assigned + recent, so no queue entry.
      expect(model.attentionQueue).toEqual([]);
    });

    it("ranks an overdue follow-up below an overdue touchpoint as a secondary reason", () => {
      const entries = [
        entry(
          UUID_1,
          "Anna One",
          careRow(UUID_1, { next: OVERDUE, last: RECENT })
        ),
      ];
      const model = buildShepherdCareDashboardModel({
        entries,
        assignments: [assignment(UUID_1, OS_A)],
        overShepherds: [overShepherd(OS_A, "Coach A")],
        recentInteractions: [],
        careFollowUps: [followUp(UUID_1, "open", OVERDUE)],
        todayIso: TODAY,
      });
      expect(model.attentionQueue[0].reason).toBe<CareAttentionReason>(
        "overdue_touchpoint"
      );
      expect(
        model.attentionQueue[0].secondaryReasons
      ).toContain<CareAttentionReason>("overdue_care_follow_up");
    });

    it("ignores follow-ups whose care profile isn't in the visible directory", () => {
      const entries = [
        entry(UUID_1, "Anna One", careRow(UUID_1, { last: RECENT })),
      ];
      const model = buildShepherdCareDashboardModel({
        entries,
        assignments: [assignment(UUID_1, OS_A)],
        overShepherds: [overShepherd(OS_A, "Coach A")],
        recentInteractions: [],
        // Orphaned follow-up for a shepherd not in the directory.
        careFollowUps: [followUp(UUID_2, "open", OVERDUE)],
        todayIso: TODAY,
      });
      expect(model.summary.overdueFollowUps).toBe(0);
      expect(model.summary.outstandingFollowUps).toBe(0);
      expect(model.attentionQueue).toEqual([]);
    });

    it("suppresses follow-up counts and reasons when careFollowUpsAvailable is false", () => {
      // Simulates a transient failure on the outstanding-follow-up read: the
      // page passes careFollowUps=[] (safe fallback) AND
      // careFollowUpsAvailable=false. The builder must NOT report a false 0
      // or omit the data silently — it flags followUpsAvailable=false instead.
      const entries = [
        entry(UUID_1, "Anna One", careRow(UUID_1, { last: RECENT })),
      ];
      const model = buildShepherdCareDashboardModel({
        entries,
        assignments: [assignment(UUID_1, OS_A)],
        overShepherds: [overShepherd(OS_A, "Coach A")],
        recentInteractions: [],
        // Even if rows somehow leak through, availability=false wins.
        careFollowUps: [followUp(UUID_1, "open", OVERDUE)],
        careFollowUpsAvailable: false,
        todayIso: TODAY,
      });
      expect(model.followUpsAvailable).toBe(false);
      expect(model.summary.overdueFollowUps).toBe(0);
      expect(model.summary.outstandingFollowUps).toBe(0);
      expect(model.attentionQueue).toEqual([]);
    });

    it("reflects overdue follow-ups in countAllAttentionItems", () => {
      const entries = [
        entry(UUID_1, "Anna One", careRow(UUID_1, { last: RECENT })),
      ];
      const careFollowUps = [followUp(UUID_1, "open", OVERDUE)];
      expect(
        countAllAttentionItems(entries, [assignment(UUID_1, OS_A)], TODAY, {
          careFollowUps,
        })
      ).toBe(1);
      // Without the follow-up the same shepherd is not flagged.
      expect(
        countAllAttentionItems(entries, [assignment(UUID_1, OS_A)], TODAY)
      ).toBe(0);
    });
  });
});
