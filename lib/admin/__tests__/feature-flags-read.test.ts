import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared mocks for the one client + one RPC the feature-flag read owns. The
// three consumers (frozen-surface gate, launch-optics mutes, nav-visibility)
// all resolve against loadAdminFeatureFlags, so this file pins that the refactor
// to a single shared read preserves each consumer's behavior and fail-safe.
const { mockCreateClient, mockFetchFlags } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockFetchFlags: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("@/lib/supabase/settings-reads", () => ({
  fetchAdminFeatureFlags: mockFetchFlags,
}));

import { loadAdminFeatureFlags } from "@/lib/admin/feature-flags-read";
import { isFrozenSurfaceLive } from "@/lib/admin/frozen-surface";
import { getMutedAttentionKeys } from "@/lib/admin/needs-attention-mutes";
import { loadHiddenNavAreas } from "@/lib/nav/hidden-nav";

// A stand-in client; fetchAdminFeatureFlags is mocked, so its shape is ignored.
const FAKE_CLIENT = { from: vi.fn() };

// Raw feature_flags sub-object as the admin_read_feature_flags() RPC returns it:
// guests frozen-surface live (enabled + verified), the Groups nav tab re-shown,
// and the follow-ups attention category muted.
const RAW_FLAGS = {
  guests: { enabled: true, verified: true },
  nav_show_groups: { enabled: true },
  mute_follow_ups: { enabled: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateClient.mockResolvedValue(FAKE_CLIENT);
  mockFetchFlags.mockResolvedValue({ data: RAW_FLAGS, error: null });
});

describe("loadAdminFeatureFlags", () => {
  it("decodes the RPC's raw feature_flags map", async () => {
    const config = await loadAdminFeatureFlags();
    expect(config).toEqual({
      guests: { enabled: true, verified: true },
      nav_show_groups: { enabled: true, verified: false },
      mute_follow_ups: { enabled: true, verified: false },
    });
  });

  it("fails safe to an empty config when no client is configured", async () => {
    mockCreateClient.mockResolvedValue(null);
    expect(await loadAdminFeatureFlags()).toEqual({});
    // No client ⇒ the RPC is never reached.
    expect(mockFetchFlags).not.toHaveBeenCalled();
  });

  it("fails safe to an empty config shape on a read error", async () => {
    mockFetchFlags.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    expect(await loadAdminFeatureFlags()).toEqual({});
  });
});

describe("feature-flag consumers resolve through the shared read", () => {
  it("isFrozenSurfaceLive reflects a live (enabled+verified) frozen flag", async () => {
    expect(await isFrozenSurfaceLive("guests")).toBe(true);
    // check_ins is absent from the stored map ⇒ stays frozen.
    expect(await isFrozenSurfaceLive("check_ins")).toBe(false);
  });

  it("isFrozenSurfaceLive fails safe to false with no client", async () => {
    mockCreateClient.mockResolvedValue(null);
    expect(await isFrozenSurfaceLive("guests")).toBe(false);
  });

  it("getMutedAttentionKeys maps muted flags to attention category keys", async () => {
    expect(await getMutedAttentionKeys()).toEqual(["follow_ups"]);
  });

  it("getMutedAttentionKeys fails safe to nothing muted with no client", async () => {
    mockCreateClient.mockResolvedValue(null);
    expect(await getMutedAttentionKeys()).toEqual([]);
  });

  it("loadHiddenNavAreas drops a re-shown tab and keeps the rest hidden", async () => {
    const hidden = await loadHiddenNavAreas();
    // nav_show_groups is on ⇒ Groups shown; People + Planning stay hidden.
    expect(hidden.has("/admin/groups")).toBe(false);
    expect(hidden.has("/admin/people")).toBe(true);
    expect(hidden.has("/admin/planning")).toBe(true);
  });

  it("loadHiddenNavAreas fails safe to the pivot default with no client", async () => {
    mockCreateClient.mockResolvedValue(null);
    const hidden = await loadHiddenNavAreas();
    expect(hidden).toEqual(
      new Set(["/admin/groups", "/admin/people", "/admin/planning"])
    );
  });
});
