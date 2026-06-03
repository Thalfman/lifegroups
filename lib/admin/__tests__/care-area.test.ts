import { describe, expect, it } from "vitest";
import { buildCareArea, type BuildCareAreaInput } from "@/lib/admin/care-area";
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
    { care_profile_id: "cp-a", status: "open", due_date: "2026-06-01" }, // overdue
    { care_profile_id: "cp-b", status: "open", due_date: "2026-06-06" }, // due soon
    { care_profile_id: "cp-b", status: "open", due_date: "2026-08-01" }, // far out
  ];
  const completedFollowUps: CareFollowUpCompletedRow[] = [
    {
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
    expect(item.actionLabel).toBe("Log contact");
    // Needs Contact links to the leader detail (default Overview tab).
    expect(item.actionHref).toBe("/admin/shepherd-care/leader-a");
  });

  it("buckets only overdue / due-soon care follow-ups into Due Soon", () => {
    const { dueSoon } = buildCareArea(baseInput());
    // The far-out (2026-08-01) follow-up is excluded; the overdue + due-soon ones stay.
    expect(dueSoon).toHaveLength(2);
    const reasons = dueSoon.map((i) => i.reason).sort();
    expect(reasons).toEqual(["Follow-up due soon", "Follow-up overdue"]);
    for (const item of dueSoon) {
      expect(item.actionLabel).toBe("View follow-up");
      expect(item.actionHref).toContain("?tab=follow-ups");
    }
  });

  it("maps recent interactions into Recent Care with the type as the reason", () => {
    const { recentCare } = buildCareArea(baseInput());
    expect(recentCare).toHaveLength(1);
    const item = recentCare[0]!;
    expect(item.personName).toBe("Ben Coleader");
    expect(item.reason).toBe("Call");
    expect(item.actionLabel).toBe("Add note");
    expect(item.actionHref).toContain("?tab=contact-history");
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
      "Create follow-up",
      "View follow-up",
      "Mark complete",
      "Add note",
    ]);
    for (const list of [
      area.needsContact,
      area.dueSoon,
      area.recentCare,
      area.completed,
    ]) {
      for (const item of list) {
        expect(allowed.has(item.actionLabel)).toBe(true);
      }
    }
  });

  it("skips follow-ups whose care profile is not in the directory", () => {
    const input = baseInput();
    input.outstandingFollowUps = [
      { care_profile_id: "cp-ghost", status: "open", due_date: "2026-06-01" },
    ];
    input.completedFollowUps = [
      {
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
