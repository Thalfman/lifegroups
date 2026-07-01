import { describe, expect, it } from "vitest";

import {
  getAdminDashboardData,
  getLeaderDashboardData,
} from "@/lib/dashboard/queries";
import {
  ADMIN_FALLBACK,
  INTEREST_FUNNEL_FALLBACK,
  LEADER_FALLBACK,
  MULTIPLY_READINESS_FALLBACK,
} from "@/lib/dashboard/fallback-data";
import { GUEST_PIPELINE_STAGES } from "@/lib/supabase/guest-reads";
import { ACTIVE_BOARD_STATES } from "@/lib/supabase/prospect-reads";
import {
  DEMO_CARE_PROFILES,
  DEMO_CARE_ROWS,
  DEMO_OVER_SHEPHERDS,
  DEMO_SHEPHERD_CARE_SUMMARY,
} from "@/lib/dashboard/demo-seed";

// The dashboard read seam has two adapters: the live Supabase path and
// the hand-built fallback returned when no client is configured. These
// tests pin the fallback adapter so it can't drift away from the
// interface the live adapter satisfies.

describe("fallback adapter — dashboard read with no client", () => {
  it("admin read returns the fallback shape, tagged as fallback", async () => {
    const result = await getAdminDashboardData(null);
    expect(result.source).toBe("fallback");
    expect(result.data).toEqual(ADMIN_FALLBACK);
  });

  it("leader read returns the fallback shape, tagged as fallback", async () => {
    const result = await getLeaderDashboardData(null, { assignedGroupIds: [] });
    expect(result.source).toBe("fallback");
    expect(result.data).toEqual(LEADER_FALLBACK);
  });
});

describe("fallback adapter — cross-field invariants the live adapter guarantees", () => {
  it("breakdown covers exactly the canonical pipeline stages, once each", () => {
    const stages = ADMIN_FALLBACK.guestPipelineBreakdown.map((r) => r.stage);
    expect([...stages].sort()).toEqual([...GUEST_PIPELINE_STAGES].sort());
  });

  it("headline count equals the breakdown's active stages (placed / not_now excluded)", () => {
    // Mirrors the live builder rule in lib/dashboard/queries.ts.
    const activeSum = ADMIN_FALLBACK.guestPipelineBreakdown
      .filter((r) => r.stage !== "placed" && r.stage !== "not_now")
      .reduce((sum, r) => sum + r.count, 0);
    expect(ADMIN_FALLBACK.guestPipelineCount).toBe(activeSum);
  });

  it("every breakdown row carries a non-empty label", () => {
    for (const row of ADMIN_FALLBACK.guestPipelineBreakdown) {
      expect(row.label.length).toBeGreaterThan(0);
    }
  });
});

// Vital signs on the pivot (#476): the band's six metrics render from these
// seeds in the no-client preview, so every pivot tile must have available,
// representative demo data behind it — and the seeds must stay internally
// consistent with the boards/cards that share them.
describe("fallback adapter — pivot vital-signs seeds (#476)", () => {
  it("seeds every pivot metric available with representative counts", () => {
    // Active groups (from the derived demo summary).
    expect(ADMIN_FALLBACK.summary.activeGroupCount).toBeGreaterThan(0);
    // Active leaders + Leaders needing care (shepherd-care seed).
    expect(ADMIN_FALLBACK.shepherdCare.available).toBe(true);
    expect(ADMIN_FALLBACK.shepherdCare.totalActiveShepherds).toBeGreaterThan(0);
    expect(ADMIN_FALLBACK.shepherdCare.needsAttention).toBeGreaterThan(0);
    // Prospects in funnel (the three live states; Joined is the roll-up).
    expect(INTEREST_FUNNEL_FALLBACK.available).toBe(true);
    const inFunnel = ACTIVE_BOARD_STATES.reduce(
      (sum, state) => sum + INTEREST_FUNNEL_FALLBACK.counts[state],
      0
    );
    expect(inFunnel).toBeGreaterThan(0);
    // Cells ready to multiply.
    expect(MULTIPLY_READINESS_FALLBACK.available).toBe(true);
    expect(MULTIPLY_READINESS_FALLBACK.activeCells).toBeGreaterThan(0);
  });

  it("keeps Leaders needing care within the active-leader total", () => {
    expect(ADMIN_FALLBACK.shepherdCare.needsAttention).toBeLessThanOrEqual(
      ADMIN_FALLBACK.shepherdCare.totalActiveShepherds
    );
  });

  it("keeps the readiness seed internally consistent (ready ≤ active)", () => {
    expect(MULTIPLY_READINESS_FALLBACK.readyCells).toBeLessThanOrEqual(
      MULTIPLY_READINESS_FALLBACK.activeCells
    );
  });

  it("derives the Care card from the demo seed through the live rule", () => {
    // The card IS the derived seed summary — no hand-kept copy to drift.
    expect(ADMIN_FALLBACK.shepherdCare).toBe(DEMO_SHEPHERD_CARE_SUMMARY);
    // Seed-to-summary coherence through the live builders: every seeded
    // Leader is counted, the two Leaders without care rows surface as
    // "no care profile", and only the seed's active coaches count.
    expect(ADMIN_FALLBACK.shepherdCare.totalActiveShepherds).toBe(
      DEMO_CARE_PROFILES.length
    );
    const withCareRow = new Set(
      DEMO_CARE_ROWS.map((r) => r.shepherd_profile_id)
    );
    expect(ADMIN_FALLBACK.shepherdCare.noCareProfile).toBe(
      DEMO_CARE_PROFILES.filter((p) => !withCareRow.has(p.id)).length
    );
    expect(ADMIN_FALLBACK.shepherdCare.activeOverShepherds).toBe(
      DEMO_OVER_SHEPHERDS.filter((o) => o.active).length
    );
    expect(ADMIN_FALLBACK.shepherdCare.coverageAvailable).toBe(true);
    expect(ADMIN_FALLBACK.shepherdCare.error).toBeNull();
  });

  it("keeps the due-this-week seed consistent with the undated demo follow-ups", () => {
    // Every demo follow-up is undated, so the band's "Follow-ups due this
    // week" demo figure is a TRUE zero (a successful read of an empty window),
    // not a degraded read presenting zero.
    expect(ADMIN_FALLBACK.followUps.every((f) => f.dueDate === null)).toBe(
      true
    );
    expect(ADMIN_FALLBACK.dueFollowUpsThisWeekCount).toBe(0);
  });
});
