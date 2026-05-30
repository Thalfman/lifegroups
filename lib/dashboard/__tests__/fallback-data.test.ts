import { describe, expect, it } from "vitest";

import {
  getAdminDashboardData,
  getLeaderDashboardData,
} from "@/lib/dashboard/queries";
import { ADMIN_FALLBACK, LEADER_FALLBACK } from "@/lib/dashboard/fallback-data";
import { GUEST_PIPELINE_STAGES } from "@/lib/supabase/read-models";

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
