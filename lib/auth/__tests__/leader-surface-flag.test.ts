import { beforeEach, describe, expect, it, vi } from "vitest";

import { readFrozenSurfaceFlagForLeader } from "@/lib/auth/leader-surface-flag";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Stub client exposing only the rpc surface the module touches.
function clientWithRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as never, rpc };
}

// The flag read is an authorization gate for the whole /leader surface and is
// deliberately fail-safe: every failure path must resolve to false (surface
// stays frozen). These tests pin each branch so a refactor cannot silently
// flip one to fail open (#867, ADR 0009/0017).
describe("readFrozenSurfaceFlagForLeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves false when no Supabase client is available", async () => {
    mockCreateClient.mockResolvedValue(null);

    await expect(
      readFrozenSurfaceFlagForLeader("leader_surface")
    ).resolves.toBe(false);
  });

  it("resolves false and logs when the RPC returns an error", async () => {
    const { client } = clientWithRpc({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    mockCreateClient.mockResolvedValue(client);

    await expect(
      readFrozenSurfaceFlagForLeader("leader_surface")
    ).resolves.toBe(false);

    const { log } = await import("@/lib/observability/logger");
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "leader_surface_flag_read_failed",
        outcome: "fail",
        flag_key: "leader_surface",
      })
    );
  });

  it.each([
    ["false", false],
    ["null", null],
    ["a string masquerading as true", "true"],
    ["undefined", undefined],
    ["a number", 1],
  ])("resolves false for a non-true payload (%s)", async (_label, data) => {
    const { client } = clientWithRpc({ data, error: null });
    mockCreateClient.mockResolvedValue(client);

    await expect(
      readFrozenSurfaceFlagForLeader("leader_surface")
    ).resolves.toBe(false);
  });

  it("resolves true only for an exact true payload", async () => {
    const { client, rpc } = clientWithRpc({ data: true, error: null });
    mockCreateClient.mockResolvedValue(client);

    await expect(
      readFrozenSurfaceFlagForLeader("leader_surface")
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("read_frozen_surface_flag", {
      p_key: "leader_surface",
    });
  });
});
