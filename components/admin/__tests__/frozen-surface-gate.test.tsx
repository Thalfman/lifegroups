import { beforeEach, describe, expect, it, vi } from "vitest";

// The frozen-surface gate (#191 / ADR 0002 + 0009; moved-to pointer #901):
// guard first (the access gate is never loosened), then the live surface only
// when the flag is enabled-and-verified — otherwise the explicit frozen
// notice, carrying a registry-derived "current home" pointer where a
// post-pivot workflow home exists (guests → Plan) and none where no
// replacement exists (check-ins, per ADR 0033). Never a redirect: these
// routes are windows into legacy data / unreplaced workflows, and an old
// bookmark must keep the frozen-state explanation. The flag resolution
// itself (verify-before-flip, fail-safe on no client / read error) is pinned
// in lib/admin/__tests__/feature-flags-read.test.ts; this file pins the
// gate's composition around it.

const { mockIsFrozenSurfaceLive } = vi.hoisted(() => ({
  mockIsFrozenSurfaceLive: vi.fn(),
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
      surfaceLabel: "The guest pipeline",
      movedTo: { href: "/admin/plan", label: "Plan — the Interest Funnel" },
      children: "live-surface",
    });

    expect(guard).toHaveBeenCalledOnce();
    expect(renderToStaticMarkup(<>{node}</>)).toContain("live-surface");
  });

  it("shows the frozen notice with the moved-to pointer while the flag is off", async () => {
    mockIsFrozenSurfaceLive.mockResolvedValue(false);

    const node = await frozenSurfaceGate({
      guard: vi.fn().mockResolvedValue(undefined),
      flagKey: "guests",
      surfaceLabel: "The guest pipeline",
      movedTo: { href: "/admin/plan", label: "Plan — the Interest Funnel" },
      children: "frozen-surface",
    });

    const html = renderToStaticMarkup(<>{node}</>);
    expect(html).toContain("The guest pipeline is frozen");
    expect(html).toContain('href="/admin/plan"');
    expect(html).toContain("Plan — the Interest Funnel");
    expect(html).not.toContain("frozen-surface");
  });

  it("shows the notice without a pointer where no replacement exists (ADR 0033)", async () => {
    mockIsFrozenSurfaceLive.mockResolvedValue(false);

    const node = await frozenSurfaceGate({
      guard: vi.fn().mockResolvedValue(undefined),
      flagKey: "check_ins",
      surfaceLabel: "Weekly check-ins",
      movedTo: null,
      children: "frozen-surface",
    });

    const html = renderToStaticMarkup(<>{node}</>);
    expect(html).toContain("Weekly check-ins is frozen");
    expect(html).not.toContain("current home");
    expect(html).not.toContain("frozen-surface");
  });

  it("runs the access guard before the flag read, and never renders past a failed guard", async () => {
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
        surfaceLabel: "The guest pipeline",
        children: null,
      })
    ).rejects.toThrow("GUARD_REDIRECT");

    // The guard exits first; the flag is never consulted for a viewer the
    // guard rejected.
    expect(order).toEqual(["guard"]);
  });
});
