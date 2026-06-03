import { describe, expect, it } from "vitest";

import { buildNeedsAttentionItems } from "@/lib/dashboard/needs-attention";
import { ADMIN_FALLBACK } from "@/lib/dashboard/fallback-data";
import type { AdminDashboardData } from "@/lib/dashboard/types";

// Needs-attention area derivation (Admin Interaction Model PRD req 7, #260).
// These pin the category and threshold rules the dashboard relies on.

function baseData(): AdminDashboardData {
  return structuredClone(ADMIN_FALLBACK);
}

// A dashboard with nothing to act on across every surfaced concern.
function allClearData(): AdminDashboardData {
  const d = baseData();
  d.setupGaps.counts = {
    noCapacity: 0,
    noLeader: 0,
    noMeetingDayTime: 0,
    noMembers: 0,
  };
  d.healthSummary.counts.missing = 0;
  d.healthSummary.counts.needs_follow_up = 0;
  d.shepherdCare.available = true;
  d.shepherdCare.needsAttention = 0;
  d.followUps = [];
  return d;
}

describe("buildNeedsAttentionItems", () => {
  it("omits zero-count concerns and never pads the list", () => {
    const d = allClearData();
    // Only one real action: groups without a leader.
    d.setupGaps.counts.noLeader = 4;

    const items = buildNeedsAttentionItems(d);
    expect(items.map((i) => i.key)).toEqual(["no_leader"]);
    expect(items[0].count).toBe(4);
  });

  it("returns an empty array when nothing needs attention", () => {
    expect(buildNeedsAttentionItems(allClearData())).toEqual([]);
  });

  it("surfaces every category that has a real action", () => {
    const d = allClearData();
    d.setupGaps.counts.noLeader = 1;
    d.setupGaps.counts.noCapacity = 2;
    d.healthSummary.counts.missing = 3;
    d.shepherdCare.needsAttention = 5;
    d.followUps = baseData().followUps; // a populated follow-ups list

    const keys = buildNeedsAttentionItems(d).map((i) => i.key);
    expect(keys).toContain("no_leader");
    expect(keys).toContain("setup_gaps");
    expect(keys).toContain("health");
    expect(keys).toContain("care_attention");
    expect(keys).toContain("follow_ups");
  });

  it("does not double-count 'no leader' inside setup gaps", () => {
    const d = allClearData();
    d.setupGaps.counts.noLeader = 7;
    // No other setup gaps, so the setup-gaps category should not appear.
    const keys = buildNeedsAttentionItems(d).map((i) => i.key);
    expect(keys).toContain("no_leader");
    expect(keys).not.toContain("setup_gaps");
  });

  it("treats a degraded leader-care read as zero, not as work to do", () => {
    const d = allClearData();
    d.shepherdCare.available = false;
    d.shepherdCare.needsAttention = 9; // stale/garbage when unavailable

    const keys = buildNeedsAttentionItems(d).map((i) => i.key);
    expect(keys).not.toContain("care_attention");
  });

  it("never surfaces a frozen workflow (e.g. the guest pipeline)", () => {
    const d = baseData();
    d.guestPipelineCount = 50; // frozen pipeline has data, but is not an action
    const items = buildNeedsAttentionItems(d);
    expect(
      items.some((i) => /guest/i.test(i.key) || /guest/i.test(i.label))
    ).toBe(false);
    expect(items.some((i) => i.href.includes("/guests"))).toBe(false);
  });

  it("marks the capped follow-ups read as a minimum (plus) at the cap", () => {
    const d = allClearData();
    d.followUps = Array.from({ length: 8 }, (_, i) => ({
      id: `f${i}`,
      title: `Follow-up ${i}`,
      type: "care" as const,
      priority: "normal" as const,
      status: "open" as const,
      dueDate: null,
      relatedGroupName: null,
    }));

    const followUps = buildNeedsAttentionItems(d).find(
      (i) => i.key === "follow_ups"
    );
    expect(followUps?.plus).toBe(true);
    expect(followUps?.count).toBe(8);
  });

  it("links each action to its surface, filtered where the destination supports it", () => {
    const d = allClearData();
    d.shepherdCare.needsAttention = 2;
    const care = buildNeedsAttentionItems(d).find(
      (i) => i.key === "care_attention"
    );
    expect(care?.href).toBe(
      "/admin/shepherd-care?view=directory&filter=needs_attention"
    );
  });

  it("opens the care tile in the filtered directory, not the scan dashboard", () => {
    // An absent `view` resolves to the dashboard, where the needs_attention
    // filter is ignored — so the tile must carry view=directory to land where
    // the admin can act.
    const d = allClearData();
    d.shepherdCare.needsAttention = 3;
    const care = buildNeedsAttentionItems(d).find(
      (i) => i.key === "care_attention"
    );
    expect(care?.href).toContain("view=directory");
    expect(care?.href).toContain("filter=needs_attention");
  });

  it("contributes nothing when the dashboard read degraded to fallback", () => {
    // ADMIN_FALLBACK is a populated demo seed, so without the degraded gate it
    // would surface several live-looking actions; a degraded read must show no
    // imperative counts (req 7).
    const d = baseData();
    expect(buildNeedsAttentionItems(d).length).toBeGreaterThan(0);
    expect(buildNeedsAttentionItems(d, { degraded: true })).toEqual([]);
  });
});
