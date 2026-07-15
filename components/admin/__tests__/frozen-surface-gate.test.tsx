import { beforeEach, describe, expect, it, vi } from "vitest";

// The frozen-surface gate (#191 / ADR 0002 + 0009, redirect behavior #901):
// guard first (the access gate is never loosened), then the live surface only
// when the flag is enabled-and-verified — otherwise the old bookmark routes to
// the registry-recorded canonical home instead of dead-ending. The flag
// resolution itself (verify-before-flip, fail-safe on no client / read error)
// is pinned in lib/admin/__tests__/feature-flags-read.test.ts; this file pins
// the gate's composition around it.

const { mockRedirect, mockIsFrozenSurfaceLive } = vi.hoisted(() => ({
  mockRedirect: vi.fn((href: string) => {
    // Mirror next/navigation's real control flow: redirect() never returns.
    throw new Error(`REDIRECT:${href}`);
  }),
  mockIsFrozenSurfaceLive: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/lib/admin/frozen-surface", () => ({
  isFrozenSurfaceLive: mockIsFrozenSurfaceLive,
}));

import { frozenSurfaceGate } from "@/components/admin/frozen-surface-gate";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("frozenSurfaceGate", () => {
  it("renders the live surface unchanged when the flag is enabled and verified", async () => {
    mockIsFrozenSurfaceLive.mockResolvedValue(true);
    const guard = vi.fn().mockResolvedValue(undefined);

    const node = await frozenSurfaceGate({
      guard,
      flagKey: "guests",
      canonicalHref: "/admin/plan",
      children: "live-surface",
    });

    expect(guard).toHaveBeenCalledOnce();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(node).not.toBeNull();
  });

  it("redirects an old bookmark to the canonical home while the flag is off", async () => {
    mockIsFrozenSurfaceLive.mockResolvedValue(false);

    await expect(
      frozenSurfaceGate({
        guard: vi.fn().mockResolvedValue(undefined),
        flagKey: "check_ins",
        canonicalHref: "/admin/care",
        children: "frozen-surface",
      })
    ).rejects.toThrow("REDIRECT:/admin/care");

    expect(mockRedirect).toHaveBeenCalledWith("/admin/care");
  });

  it("runs the access guard before the flag read, and never redirects past a failed guard", async () => {
    const order: string[] = [];
    mockIsFrozenSurfaceLive.mockImplementation(async () => {
      order.push("flag");
      return false;
    });
    const guard = vi.fn(async () => {
      order.push("guard");
      throw new Error("GUARD_REDIRECT");
    });

    await expect(
      frozenSurfaceGate({
        guard,
        flagKey: "guests",
        canonicalHref: "/admin/plan",
        children: null,
      })
    ).rejects.toThrow("GUARD_REDIRECT");

    // The guard exits first; the flag is never consulted and the canonical
    // redirect never fires for a viewer the guard rejected.
    expect(order).toEqual(["guard"]);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
