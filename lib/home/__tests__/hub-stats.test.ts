import { beforeEach, describe, expect, it, vi } from "vitest";

// loadHubStats composes three independent reads via Promise.allSettled and must
// degrade gracefully: a failed read omits its stat (the hub never surfaces an
// error). Mock the read-models layer so the test pins that composition + the
// resilience contract without a live database.

const { mockGroupCount, mockMemberships, mockDueFollowUps } = vi.hoisted(
  () => ({
    mockGroupCount: vi.fn(),
    mockMemberships: vi.fn(),
    mockDueFollowUps: vi.fn(),
  })
);

vi.mock("@/lib/supabase/read-models", () => ({
  fetchActiveGroupCount: mockGroupCount,
  fetchActiveMemberships: mockMemberships,
  fetchOpenFollowUpsDueCount: mockDueFollowUps,
}));

import { loadHubStats } from "../hub-stats";

const client = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadHubStats", () => {
  it("returns all three live stats when every read succeeds", async () => {
    mockGroupCount.mockResolvedValue({ data: 7 });
    mockMemberships.mockResolvedValue({ data: [{}, {}, {}] });
    mockDueFollowUps.mockResolvedValue({ data: 4 });

    const stats = await loadHubStats(client);

    expect(stats).toEqual([
      { label: "Active groups", value: 7 },
      { label: "People in groups", value: 3 },
      { label: "Follow-ups due", value: 4 },
    ]);
  });

  it("omits only the failed stat — a rejected read never throws or zeroes the others", async () => {
    mockGroupCount.mockResolvedValue({ data: 5 });
    mockMemberships.mockRejectedValue(new Error("rls denied"));
    mockDueFollowUps.mockResolvedValue({ data: 0 });

    const stats = await loadHubStats(client);

    // The memberships stat is dropped; the others (including a TRUE zero) stand.
    expect(stats).toEqual([
      { label: "Active groups", value: 5 },
      { label: "Follow-ups due", value: 0 },
    ]);
  });

  it("omits a stat whose read returns a non-numeric/absent payload (no false zero)", async () => {
    mockGroupCount.mockResolvedValue({ data: null });
    mockMemberships.mockResolvedValue({ data: null });
    mockDueFollowUps.mockResolvedValue({ data: 2 });

    const stats = await loadHubStats(client);

    expect(stats).toEqual([{ label: "Follow-ups due", value: 2 }]);
  });
});
