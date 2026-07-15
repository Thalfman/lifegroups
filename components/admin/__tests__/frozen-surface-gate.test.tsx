import { beforeEach, describe, expect, it, vi } from "vitest";

// The frozen-surface gate (#191 / ADR 0002 + 0009; flag-off fallbacks #901):
// guard first (the access gate is never loosened), then the live surface only
// when the flag is enabled-and-verified — otherwise the layout's declared
// fallback: a redirect to the surface's post-pivot home (guests → Plan), or
// the explicit frozen notice where no replacement exists (check-ins, per ADR
// 0033). The flag resolution itself (verify-before-flip, fail-safe on no
// client / read error) is pinned in lib/admin/__tests__/feature-flags-read.test.ts;
// this file pins the gate's composition around it.

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

import { renderToStaticMarkup } from "react-dom/server";
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
      whenFrozen: { redirectTo: "/admin/plan" },
      children: "live-surface",
    });

    expect(guard).toHaveBeenCalledOnce();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(node).not.toBeNull();
  });

  it("redirects an old bookmark to the declared home while the flag is off", async () => {
    mockIsFrozenSurfaceLive.mockResolvedValue(false);

    await expect(
      frozenSurfaceGate({
        guard: vi.fn().mockResolvedValue(undefined),
        flagKey: "guests",
        whenFrozen: { redirectTo: "/admin/plan" },
        children: "frozen-surface",
      })
    ).rejects.toThrow("REDIRECT:/admin/plan");

    expect(mockRedirect).toHaveBeenCalledWith("/admin/plan");
  });

  it("keeps the frozen notice for surfaces with no replacement (ADR 0033)", async () => {
    mockIsFrozenSurfaceLive.mockResolvedValue(false);

    const node = await frozenSurfaceGate({
      guard: vi.fn().mockResolvedValue(undefined),
      flagKey: "check_ins",
      whenFrozen: { notice: { surfaceLabel: "Weekly check-ins" } },
      children: "frozen-surface",
    });

    expect(mockRedirect).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(<>{node}</>);
    expect(html).toContain("Weekly check-ins");
    expect(html).not.toContain("frozen-surface");
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
        whenFrozen: { redirectTo: "/admin/plan" },
        children: null,
      })
    ).rejects.toThrow("GUARD_REDIRECT");

    // The guard exits first; the flag is never consulted and the fallback
    // never fires for a viewer the guard rejected.
    expect(order).toEqual(["guard"]);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
