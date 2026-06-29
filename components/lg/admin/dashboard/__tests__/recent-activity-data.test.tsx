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
    expect(mockFetchGuests).toHaveBeenCalledTimes(1); // guestsLive ⇒ tile shown
    const activity = (el.props as { activity: { grain: string } }).activity;
    expect(activity.grain).toBe("month");
  });

  it("skips the guests read when the Guests surface is frozen", async () => {
    // guestsLive=false ⇒ the "Guests welcomed" tile is not rendered, so the
    // boundary must not issue fetchGuests (avoidable Supabase work + guest PII
    // pulled into this hot path for a value that is never shown).
    await RecentActivityData({ grain: "all", guestsLive: false, now: NOW });

    expect(mockFetchGuests).not.toHaveBeenCalled();
    // The other live reads still run.
    expect(mockLoadGroups).toHaveBeenCalledTimes(1);
    expect(mockFetchCounts).toHaveBeenCalledTimes(1);
  });

  it("marks Guests welcomed unavailable (not a false zero / not demo) when the independent guests read fails", async () => {
    // The activity guests read is independent of the dashboard's (uncached), so
    // it can fail while the dashboard succeeded (degraded=false). The tile must
    // show "—" (null) — neither a false zero (guestsRes.data ?? []) nor the demo
    // count. The rest of the live page stays live.
    mockFetchGuests.mockResolvedValue({
      data: null,
      error: new Error("guests read failed"),
    });

    const el = (await RecentActivityData({
      grain: "all",
      guestsLive: true,
      now: NOW,
    })) as ReactElement;

    const activity = (
      el.props as { activity: { guestsWelcomed: number | null } }
    ).activity;
    expect(activity).not.toBe(fallbackActivity);
    expect(activity.guestsWelcomed).toBeNull();
  });

  it("marks Groups launched unavailable when the groups read fails", async () => {
    mockLoadGroups.mockResolvedValue({
      data: null,
      error: new Error("groups read failed"),
    });

    const el = (await RecentActivityData({
      grain: "all",
      guestsLive: false,
      now: NOW,
    })) as ReactElement;

    const activity = (
      el.props as { activity: { groupsLaunched: number | null } }
    ).activity;
    expect(activity).not.toBe(fallbackActivity);
    expect(activity.groupsLaunched).toBeNull();
  });
});
