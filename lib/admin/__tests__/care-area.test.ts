import { describe, expect, it } from "vitest";
import {
  buildCareArea,
  openFollowUpCountsByQueue,
  type BuildCareAreaInput,
} from "@/lib/admin/care-area";
import type {
  CareFollowUpCompletedRow,
  CareFollowUpDashboardRow,
  ShepherdCareDirectoryEntry,
  ShepherdCareRecentInteractionRow,
} from "@/lib/supabase/read-models";
import type { CareAttentionItem } from "@/lib/admin/shepherd-care-dashboard";

const TODAY = "2026-06-03";

function entry(
  profileId: string,
  careProfileId: string,
  fullName: string,
  nextTouchpoint: string | null
): ShepherdCareDirectoryEntry {
  return {
    profile: {
      id: profileId,
      full_name: fullName,
      email: `${profileId}@example.com`,
      role: "leader",
      status: "active",
    },
    care: {
      id: careProfileId,
      shepherd_profile_id: profileId,
      current_status: "doing_well",
      last_contact_at: null,
      next_touchpoint_due: nextTouchpoint,
      archived_at: null,
      created_at: `${TODAY}T00:00:00Z`,
      updated_at: `${TODAY}T00:00:00Z`,
    },
    needs_attention: true,
  };
}

function baseInput(): BuildCareAreaInput {
  const entries = [
    entry("leader-a", "cp-a", "Ada Leader", "2026-06-01"),
    entry("leader-b", "cp-b", "Ben Coleader", "2026-06-06"),
  ];
  const attentionQueue: CareAttentionItem[] = [
    {
      shepherdProfileId: "leader-a",
      shepherdName: "Ada Leader",
      reason: "no_contact_yet",
      secondaryReasons: [],
      detail: "No contact logged yet",
      priority: 1,
      href: "/admin/shepherd-care/leader-a",
    },
  ];
  const outstandingFollowUps: CareFollowUpDashboardRow[] = [
    {
      id: "fu-1",
      care_profile_id: "cp-a",
      status: "open",
      due_date: "2026-06-01",
    }, // overdue
    {
      id: "fu-2",
      care_profile_id: "cp-b",
      status: "open",
      due_date: "2026-06-06",
    }, // due soon
    {
      id: "fu-3",
      care_profile_id: "cp-b",
      status: "open",
      due_date: "2026-08-01",
    }, // far out
  ];
  const completedFollowUps: CareFollowUpCompletedRow[] = [
    {
      id: "done-1",
      care_profile_id: "cp-a",
      status: "done",
      due_date: "2026-05-20",
      completed_at: "2026-05-21T12:00:00Z",
    },
  ];
  const recentInteractions: ShepherdCareRecentInteractionRow[] = [
    {
      id: "int-1",
      care_profile_id: "cp-b",
      interaction_at: "2026-06-02T10:00:00Z",
      interaction_type: "call",
      created_at: "2026-06-02T10:05:00Z",
      shepherd_profile_id: "leader-b",
      shepherd_full_name: "Ben Coleader",
    },
  ];
  return {
    entries,
    attentionQueue,
    outstandingFollowUps,
    completedFollowUps,
    recentInteractions,
    ownerNameByShepherdId: new Map([["leader-a", "Tom"]]),
    groupNameByShepherdId: new Map([["leader-a", "Anderson Life Group"]]),
    todayIso: TODAY,
  };
}

describe("buildCareArea", () => {
  it("maps the attention queue into Needs Contact six-field items", () => {
    const { needsContact } = buildCareArea(baseInput());
    expect(needsContact).toHaveLength(1);
    const item = needsContact[0]!;
    expect(item.personName).toBe("Ada Leader");
    expect(item.reason).toBe("No contact logged yet");
    expect(item.groupName).toBe("Anderson Life Group");
    expect(item.ownerName).toBe("Tom");
    expect(item.dueLabel).toBe("Overdue 2 days");
    // leader-a has an over-shepherd (Tom) and a scheduled touchpoint, so the
    // obvious next action is logging the contact (#332).
    expect(item.actionLabel).toBe("Log contact");
    // Record-context accessible name (#332 / req 4), not a bare verb.
    expect(item.actionAccessibleName).toBe("Log contact for Ada Leader");
    // Needs Contact links to the leader detail's Overview tab (where the
    // log / touchpoint / coverage forms live).
    expect(item.actionHref).toBe("/admin/shepherd-care/leader-a?tab=overview");
  });

  it("surfaces Assign over-shepherd when a flagged leader has no coverage", () => {
    const input = baseInput();
    input.ownerNameByShepherdId = new Map(); // leader-a now uncovered
    const item = buildCareArea(input).needsContact[0]!;
    expect(item.actionLabel).toBe("Assign over-shepherd");
    expect(item.actionAccessibleName).toBe(
      "Assign over-shepherd for Ada Leader"
    );
    expect(item.actionHref).toBe("/admin/shepherd-care/leader-a?tab=overview");
  });

  it("routes an overdue-follow-up Needs-Contact row to Resolve follow-up on the Follow-ups tab", () => {
    const input = baseInput();
    // leader-a is covered (Tom) and has a scheduled touchpoint, so the contact
    // precedence alone would pick "Log contact" → Overview. But the attention
    // engine flagged this row PRIMARILY for an overdue care follow-up, so the
    // obvious next action is to resolve that follow-up on the Follow-ups tab
    // (#332), not a coverage/touchpoint/log-contact action on Overview.
    input.attentionQueue = [
      {
        shepherdProfileId: "leader-a",
        shepherdName: "Ada Leader",
        reason: "overdue_care_follow_up",
        secondaryReasons: [],
        detail: "1 follow-up overdue",
        priority: 2,
        href: "/admin/shepherd-care/leader-a",
      },
    ];
    const item = buildCareArea(input).needsContact[0]!;
    expect(item.reason).toBe("1 follow-up overdue");
    expect(item.actionLabel).toBe("Resolve follow-up");
    expect(item.actionAccessibleName).toBe("Resolve follow-up for Ada Leader");
    expect(item.actionHref).toBe(
      "/admin/shepherd-care/leader-a?tab=follow-ups"
    );
  });

  it("surfaces Schedule touchpoint when a covered leader has no touchpoint", () => {
    const input = baseInput();
    // Covered (Tom) but clear the next-touchpoint date on leader-a's entry.
    input.entries = input.entries.map((e) =>
      e.profile.id === "leader-a" && e.care
        ? { ...e, care: { ...e.care, next_touchpoint_due: null } }
        : e
    );
    const item = buildCareArea(input).needsContact[0]!;
    expect(item.actionLabel).toBe("Schedule touchpoint");
    expect(item.actionAccessibleName).toBe(
      "Schedule touchpoint for Ada Leader"
    );
  });

  it("buckets only overdue / due-soon care follow-ups into Due Soon", () => {
    const { dueSoon } = buildCareArea(baseInput());
    // The far-out (2026-08-01) follow-up is excluded; the overdue + due-soon ones stay.
    expect(dueSoon).toHaveLength(2);
    const reasons = dueSoon.map((i) => i.reason).sort();
    expect(reasons).toEqual(["Follow-up due soon", "Follow-up overdue"]);
    // Most overdue first: the overdue row sorts ahead of the due-soon row.
    expect(dueSoon[0]!.reason).toBe("Follow-up overdue");
    expect(dueSoon[0]!.key).toBe("fu-fu-1");
    for (const item of dueSoon) {
      // An open follow-up's obvious next action is to resolve it (#332).
      expect(item.actionLabel).toBe("Resolve follow-up");
      expect(item.actionAccessibleName).toBe(
        `Resolve follow-up for ${item.personName}`
      );
      expect(item.actionHref).toContain("?tab=follow-ups");
    }
  });

  it("maps recent interactions into Recent Care with the type as the reason", () => {
    const { recentCare } = buildCareArea(baseInput());
    expect(recentCare).toHaveLength(1);
    const item = recentCare[0]!;
    expect(item.personName).toBe("Ben Coleader");
    expect(item.reason).toBe("Call");
    // After a logged contact, the obvious next action is to continue the
    // cadence with another contact (#332).
    expect(item.actionLabel).toBe("Log contact");
    expect(item.actionAccessibleName).toBe("Log contact for Ben Coleader");
    expect(item.actionHref).toContain("?tab=overview");
  });

  it("maps completed care follow-ups into Completed", () => {
    const { completed } = buildCareArea(baseInput());
    expect(completed).toHaveLength(1);
    const item = completed[0]!;
    expect(item.personName).toBe("Ada Leader");
    expect(item.reason).toBe("Follow-up completed");
    expect(item.actionLabel).toBe("View follow-up");
  });

  it("uses explicit verb action labels only (no Open / Manage / Update)", () => {
    const area = buildCareArea(baseInput());
    const allowed = new Set([
      "Log contact",
      "Assign over-shepherd",
      "Schedule touchpoint",
      "Resolve follow-up",
      "View follow-up",
    ]);
    for (const list of [
      area.needsContact,
      area.dueSoon,
      area.recentCare,
      area.completed,
    ]) {
      for (const item of list) {
        expect(allowed.has(item.actionLabel)).toBe(true);
        // Every item carries a record-context accessible name (#332 / req 4).
        expect(item.actionAccessibleName).toContain(item.personName);
      }
    }
  });

  it("skips follow-ups whose care profile is not in the directory", () => {
    const input = baseInput();
    input.outstandingFollowUps = [
      {
        id: "fu-ghost",
        care_profile_id: "cp-ghost",
        status: "open",
        due_date: "2026-06-01",
      },
    ];
    input.completedFollowUps = [
      {
        id: "done-ghost",
        care_profile_id: "cp-ghost",
        status: "done",
        due_date: "2026-05-01",
        completed_at: "2026-05-02T00:00:00Z",
      },
    ];
    const { dueSoon, completed } = buildCareArea(input);
    expect(dueSoon).toHaveLength(0);
    expect(completed).toHaveLength(0);
  });
});

// #479 — the Follow-ups tab badge: one combined open count across BOTH
// follow-up queues (care follow-ups about Leaders + the general `follow_ups`
// queue for groups and tasks). Counting only — the two tables stay separate
// models; a single-queue merge is explicitly out of scope.
describe("openFollowUpCountsByQueue (#479 / #644)", () => {
  const careFollowUps = [
    { status: "open" as const },
    { status: "in_progress" as const },
    // The outstanding feed is not-done at the DB level; the defensive filter
    // must still exclude a done row if one ever slips through.
    { status: "done" as const },
  ];
  const generalFollowUps = [
    { status: "open" as const },
    { status: "in_progress" as const },
    // Snoozed is still open work — it matches the queue's "Open items" filter.
    { status: "snoozed" as const },
    { status: "done" as const },
  ];

  it("counts each queue's open (not-done) items separately, never merged", () => {
    expect(
      openFollowUpCountsByQueue({
        careFollowUps,
        careFollowUpsAvailable: true,
        generalFollowUps,
        generalFollowUpsAvailable: true,
      })
    ).toEqual({ care: 2, general: 3 });
  });

  it("is 0/0 when both feeds loaded and are genuinely empty", () => {
    expect(
      openFollowUpCountsByQueue({
        careFollowUps: [],
        careFollowUpsAvailable: true,
        generalFollowUps: [],
        generalFollowUpsAvailable: true,
      })
    ).toEqual({ care: 0, general: 0 });
  });

  it("suppresses the figures when the care feed failed (no false low count)", () => {
    expect(
      openFollowUpCountsByQueue({
        careFollowUps: [],
        careFollowUpsAvailable: false,
        generalFollowUps,
        generalFollowUpsAvailable: true,
      })
    ).toBeUndefined();
  });

  it("suppresses the figures when the general feed failed (no false low count)", () => {
    expect(
      openFollowUpCountsByQueue({
        careFollowUps,
        careFollowUpsAvailable: true,
        generalFollowUps: [],
        generalFollowUpsAvailable: false,
      })
    ).toBeUndefined();
  });
});
