import { describe, expect, it } from "vitest";

import {
  buildNeedsAttentionItems,
  buildTopNextActions,
} from "@/lib/dashboard/needs-attention";
import { resolveCareInitialTabFromParams } from "@/lib/admin/shepherd-care-view";
import { resolveMutedAttentionKeys } from "@/lib/admin/feature-flags";
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

  it("lands the care action on the All-leaders tab, filtered to needs attention (#477)", () => {
    // The six→four consolidation merged the Dashboard into the All-leaders
    // tab and restored the roster's needs-attention filter, so Home's link
    // finally lands filtered: the legacy view=directory param selects the
    // merged tab and filter=needs_attention pre-applies the row filter.
    const d = allClearData();
    d.shepherdCare.needsAttention = 2;
    const care = buildNeedsAttentionItems(d).find(
      (i) => i.key === "care_attention"
    );
    expect(care?.href).toBe(
      "/admin/care?view=directory&filter=needs_attention"
    );
  });

  it("lands the open-follow-ups action on canonical Care's Follow-ups tab (#468)", () => {
    // The off-nav /admin/follow-ups alias still resolves for old bookmarks,
    // but Home emits the canonical Care URL with the follow-ups tab selected.
    const d = allClearData();
    d.followUps = baseData().followUps;
    const followUps = buildNeedsAttentionItems(d).find(
      (i) => i.key === "follow_ups"
    );
    expect(followUps?.href).toBe("/admin/care?view=follow-ups");
  });

  it("emits only canonical Care URLs — never the legacy aliases (#468)", () => {
    const d = allClearData();
    d.shepherdCare.needsAttention = 3;
    d.followUps = baseData().followUps;
    d.healthSummary.counts.missing = 1;
    for (const item of buildNeedsAttentionItems(d)) {
      expect(item.href).not.toContain("/admin/shepherd-care");
      expect(item.href).not.toContain("/admin/follow-ups");
    }
  });

  it("round-trips the Home action hrefs onto the intended Care tabs (#468)", () => {
    // The emitted `view` params must be ones resolveCareInitialTabFromParams
    // actually understands, or the action would reopen the default tab.
    const d = allClearData();
    d.shepherdCare.needsAttention = 1;
    d.followUps = baseData().followUps;
    const byKey = Object.fromEntries(
      buildNeedsAttentionItems(d).map((i) => [i.key, i.href])
    );
    const tabFor = (href: string) => {
      const query = new URLSearchParams(href.split("?")[1] ?? "");
      return resolveCareInitialTabFromParams(
        Object.fromEntries(query.entries()),
        "over-shepherds"
      );
    };
    // #477: the care action lands on the merged All-leaders tab (where the
    // page also pre-applies the needs-attention roster filter).
    expect(tabFor(byKey.care_attention)).toBe("all-leaders");
    expect(tabFor(byKey.follow_ups)).toBe("follow-ups");
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

// Launch-optics mutes (#reset-attention-metrics): a Super Admin can hide a
// time-based category from the Home queue via mutedKeys, so a brand-new ministry
// does not read as behind on day one. Only the three time-based categories are
// mutable; no_leader / setup_gaps are unaffected by construction.
describe("buildNeedsAttentionItems: muted categories", () => {
  // Every category has a real action, so the only reason one drops out is a mute.
  function everyCategoryData(): AdminDashboardData {
    const d = allClearData();
    d.setupGaps.counts.noLeader = 1;
    d.setupGaps.counts.noCapacity = 2; // a setup gap
    d.healthSummary.counts.missing = 3;
    d.shepherdCare.needsAttention = 4;
    d.followUps = baseData().followUps; // a populated follow-ups list
    return d;
  }

  it("drops a muted time-based category from the area even when its count > 0", () => {
    const d = everyCategoryData();
    const keys = buildNeedsAttentionItems(d, {
      mutedKeys: new Set(["care_attention"]),
    }).map((i) => i.key);
    expect(keys).not.toContain("care_attention");
    // The other categories are untouched.
    expect(keys).toContain("health");
    expect(keys).toContain("follow_ups");
  });

  it("mutes health and follow-ups independently", () => {
    const d = everyCategoryData();
    const keys = buildNeedsAttentionItems(d, {
      mutedKeys: new Set(["health", "follow_ups"]),
    }).map((i) => i.key);
    expect(keys).not.toContain("health");
    expect(keys).not.toContain("follow_ups");
    expect(keys).toContain("care_attention");
  });

  it("never mutes the non-time-based categories, even when all three mutes are on", () => {
    const d = everyCategoryData();
    const keys = buildNeedsAttentionItems(d, {
      mutedKeys: new Set(["care_attention", "health", "follow_ups"]),
    }).map((i) => i.key);
    expect(keys).toEqual(["no_leader", "setup_gaps"]);
  });

  it("can never mute no_leader / setup_gaps via the real flag resolver", () => {
    // The structural guarantee: even with every mute flag on, the keys the
    // resolver produces only ever name time-based categories, so the
    // non-time-based actions survive end-to-end.
    const d = everyCategoryData();
    const mutedKeys = resolveMutedAttentionKeys({
      mute_care_attention: { enabled: true },
      mute_health_checks: { enabled: true },
      mute_follow_ups: { enabled: true },
    });
    const keys = buildNeedsAttentionItems(d, { mutedKeys }).map((i) => i.key);
    expect(keys).toEqual(["no_leader", "setup_gaps"]);
  });

  it("collapses to an empty queue when the only action is muted (all-clear)", () => {
    const d = allClearData();
    d.followUps = baseData().followUps; // the single remaining action
    expect(buildNeedsAttentionItems(d).map((i) => i.key)).toEqual([
      "follow_ups",
    ]);
    expect(
      buildTopNextActions(d, { mutedKeys: new Set(["follow_ups"]) })
    ).toEqual([]);
  });
});

// Care/Plan/Multiply pivot (ADR 0016): group/member setup was retired, so the
// Groups-bound actions drop out when the Groups tab is hidden, and the health
// action lands on the active Care area instead of the off-nav group-health page.
describe("buildNeedsAttentionItems: pivot link hygiene", () => {
  function everyCategoryData(): AdminDashboardData {
    const d = allClearData();
    d.setupGaps.counts.noLeader = 1;
    d.setupGaps.counts.noCapacity = 2; // a setup gap
    d.healthSummary.counts.missing = 3;
    d.shepherdCare.needsAttention = 4;
    d.followUps = baseData().followUps; // a populated follow-ups list
    return d;
  }

  it("keeps the Groups-bound actions when no hidden-nav set is supplied", () => {
    const keys = buildNeedsAttentionItems(everyCategoryData()).map(
      (i) => i.key
    );
    expect(keys).toContain("no_leader");
    expect(keys).toContain("setup_gaps");
  });

  it("keeps the Groups-bound actions when Groups is NOT hidden", () => {
    const keys = buildNeedsAttentionItems(everyCategoryData(), {
      hiddenNavAreas: new Set(["/admin/people", "/admin/planning"]),
    }).map((i) => i.key);
    expect(keys).toContain("no_leader");
    expect(keys).toContain("setup_gaps");
  });

  it("drops both Groups-bound actions when the Groups tab is hidden", () => {
    const keys = buildNeedsAttentionItems(everyCategoryData(), {
      hiddenNavAreas: new Set(["/admin/groups"]),
    }).map((i) => i.key);
    expect(keys).not.toContain("no_leader");
    expect(keys).not.toContain("setup_gaps");
    // The non-Groups actions are untouched.
    expect(keys).toContain("care_attention");
    expect(keys).toContain("health");
    expect(keys).toContain("follow_ups");
  });

  it("threads the Groups-hidden gate through the ranked queue too", () => {
    const keys = buildTopNextActions(everyCategoryData(), {
      hiddenNavAreas: new Set(["/admin/groups"]),
    }).map((a) => a.key);
    expect(keys).toEqual(["care_attention", "health", "follow_ups"]);
  });

  it("lands the health action on the active Care area, not the off-nav page", () => {
    const d = allClearData();
    d.healthSummary.counts.missing = 3;
    const health = buildNeedsAttentionItems(d).find((i) => i.key === "health");
    expect(health?.href).toBe("/admin/care");
  });
});

// Ranked "Top next actions" queue (Admin Interaction Model PRD req 8, #271).
// Pins the director-confirmed fixed ordering and the imperative phrasing.
describe("buildTopNextActions", () => {
  it("orders across categories by the fixed director priority, not by count", () => {
    // Counts deliberately invert the priority: many overdue health checks,
    // a single unassigned group. Rank must still put leaders first.
    const d = allClearData();
    d.setupGaps.counts.noLeader = 1;
    d.setupGaps.counts.noCapacity = 1; // a setup gap
    d.healthSummary.counts.missing = 20;
    d.shepherdCare.needsAttention = 3;
    d.followUps = baseData().followUps;

    const keys = buildTopNextActions(d).map((a) => a.key);
    expect(keys).toEqual([
      "no_leader",
      "setup_gaps",
      "care_attention",
      "health",
      "follow_ups",
    ]);
  });

  it("phrases each action as an imperative with the live count folded in", () => {
    const d = allClearData();
    d.setupGaps.counts.noLeader = 16;
    const [leaders] = buildTopNextActions(d);
    expect(leaders.action).toBe("Assign leaders to 16 groups");
  });

  it("uses the singular for a count of one", () => {
    const d = allClearData();
    d.setupGaps.counts.noLeader = 1;
    expect(buildTopNextActions(d)[0].action).toBe("Assign a leader to 1 group");
  });

  it("renders the capped follow-ups read as N+ in the imperative", () => {
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
    const followUps = buildTopNextActions(d).find(
      (a) => a.key === "follow_ups"
    );
    expect(followUps?.action).toBe("Resolve 8+ open follow-ups");
  });

  it("drops zero-count categories rather than padding the queue", () => {
    const d = allClearData();
    d.setupGaps.counts.noLeader = 2;
    const actions = buildTopNextActions(d);
    expect(actions.map((a) => a.key)).toEqual(["no_leader"]);
  });

  it("returns an empty queue (the consolidated all-clear) when nothing is left", () => {
    expect(buildTopNextActions(allClearData())).toEqual([]);
  });

  it("contributes nothing when the dashboard read degraded to fallback", () => {
    const d = baseData();
    expect(buildTopNextActions(d).length).toBeGreaterThan(0);
    expect(buildTopNextActions(d, { degraded: true })).toEqual([]);
  });
});

// "Why it matters" rationale (req #323). A static, per-category pastoral line
// that explains why now — derived purely, never from the count.
describe("buildTopNextActions: why-it-matters rationale", () => {
  it("carries the calm pastoral rationale for each category", () => {
    const d = allClearData();
    d.setupGaps.counts.noLeader = 2;
    d.setupGaps.counts.noCapacity = 1;
    d.healthSummary.counts.missing = 3;
    d.shepherdCare.needsAttention = 4;
    d.followUps = baseData().followUps;

    const why = Object.fromEntries(
      buildTopNextActions(d).map((a) => [a.key, a.why])
    );
    expect(why.no_leader).toBe("Unled groups can't meet or grow.");
    expect(why.setup_gaps).toBe(
      "Missing details keep a group from gathering well."
    );
    expect(why.care_attention).toBe(
      "Leaders carry more when no one is checking in."
    );
    expect(why.health).toBe(
      "Regular checks keep a group's health from drifting unseen."
    );
    expect(why.follow_ups).toBe(
      "Follow-ups close the loop on care already begun."
    );
  });

  it("gives every returned category a non-empty rationale", () => {
    const d = allClearData();
    d.setupGaps.counts.noLeader = 1;
    d.setupGaps.counts.noCapacity = 1;
    d.healthSummary.counts.missing = 1;
    d.shepherdCare.needsAttention = 1;
    d.followUps = baseData().followUps;

    const actions = buildTopNextActions(d);
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(a.why.trim().length).toBeGreaterThan(0);
    }
  });

  it("derives the rationale purely — identical regardless of the count", () => {
    const one = allClearData();
    one.setupGaps.counts.noLeader = 1;
    const many = allClearData();
    many.setupGaps.counts.noLeader = 99;

    expect(buildTopNextActions(one)[0].why).toBe(
      buildTopNextActions(many)[0].why
    );
  });

  it("returns no rows (so no rationale) when the read degraded", () => {
    // Degraded → empty queue, so there are simply no why lines to render.
    expect(buildTopNextActions(baseData(), { degraded: true })).toEqual([]);
  });

  it("returns no rows (so no rationale) when nothing needs attention", () => {
    expect(buildTopNextActions(allClearData())).toEqual([]);
  });
});
