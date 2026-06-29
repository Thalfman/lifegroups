import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// RecentActivityData is the async server loader for Home's "Recent activity"
// boundary. These pin the two short-circuits that keep it consistent with the
// rest of Home — the no-client demo path and the degraded-dashboard path
// (Codex P2): when the dashboard fell back to demo data because a gated read
// failed, activity must show the SAME demo summary, not read live (and risk
// false zeroes from a failed groups/guests read).
const {
  mockCreateClient,
  mockLoadGroups,
  mockFetchGuests,
  mockFetchCounts,
  mockFetchBaseline,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockLoadGroups: vi.fn(),
  mockFetchGuests: vi.fn(),
  mockFetchCounts: vi.fn(),
  mockFetchBaseline: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));
vi.mock("@/lib/admin/groups-read", () => ({
  loadAllGroupsForAdmin: mockLoadGroups,
}));
vi.mock("@/lib/supabase/read-models", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/read-models")>()),
  fetchGuests: mockFetchGuests,
  fetchOverviewActivityCounts: mockFetchCounts,
}));
vi.mock("@/lib/supabase/maintenance-reads", () => ({
  fetchActivityResetBaseline: mockFetchBaseline,
}));

import { RecentActivityData } from "../recent-activity-data";
import { RecentActivitySection } from "../RecentActivitySection";
import { fallbackActivity } from "@/lib/dashboard/fallback-data";

const NOW = new Date("2026-05-18T12:00:00Z");

function expectsNoLiveReads() {
  expect(mockFetchBaseline).not.toHaveBeenCalled();
  expect(mockLoadGroups).not.toHaveBeenCalled();
  expect(mockFetchGuests).not.toHaveBeenCalled();
  expect(mockFetchCounts).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateClient.mockResolvedValue({ from: vi.fn() });
  mockFetchBaseline.mockResolvedValue({ data: null, error: null });
  mockLoadGroups.mockResolvedValue({ data: [], error: null });
  mockFetchGuests.mockResolvedValue({ data: [], error: null });
  mockFetchCounts.mockResolvedValue({
    data: {
      membersJoined: 0,
      followUpsCompleted: 0,
      careTouchpoints: 0,
      prospectsAdded: 0,
    },
    error: null,
  });
});

describe("RecentActivityData", () => {
  it("renders the demo summary and skips live reads when the dashboard is degraded", async () => {
    const el = (await RecentActivityData({
      grain: "all",
      guestsLive: false,
      degraded: true,
      now: NOW,
    })) as ReactElement;

    expect(el.type).toBe(RecentActivitySection);
    expect((el.props as { activity: unknown }).activity).toBe(fallbackActivity);
    expectsNoLiveReads();
  });

  it("renders the demo summary and skips live reads when no client is configured", async () => {
    mockCreateClient.mockResolvedValue(null);

    const el = (await RecentActivityData({
      grain: "all",
      guestsLive: false,
      now: NOW,
    })) as ReactElement;

    expect((el.props as { activity: unknown }).activity).toBe(fallbackActivity);
    expectsNoLiveReads();
  });

  it("reads live and builds the summary for the requested grain when healthy", async () => {
    const el = (await RecentActivityData({
      grain: "month",
      guestsLive: true,
      now: NOW,
    })) as ReactElement;

    expect(mockFetchCounts).toHaveBeenCalledTimes(1);
    const activity = (el.props as { activity: { grain: string } }).activity;
    expect(activity.grain).toBe("month");
  });
});
