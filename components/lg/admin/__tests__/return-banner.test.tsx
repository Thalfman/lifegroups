// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ReturnBanner reads the marker from useSearchParams; drive it with a settable
// URLSearchParams so we can exercise the return vs normal-visit branches.
let currentParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => currentParams,
}));

import { ReturnBanner } from "@/components/lg/admin/return-banner";

beforeEach(() => {
  currentParams = new URLSearchParams();
});
afterEach(cleanup);

// #776 Phase 1 (OPP-8) — the generalized, self-gating return affordance, with
// the dynamic group-health origin.
describe("ReturnBanner", () => {
  it("renders a dynamic link back to the originating group on a return visit", () => {
    currentParams = new URLSearchParams("tab=care&from=group-health&group=g1");
    render(<ReturnBanner originKey="group-health" />);
    const link = screen.getByRole("link", { name: "← Back to group health" });
    expect(link.getAttribute("href")).toBe(
      "/admin/groups/g1?tab=health&from=group-health"
    );
  });

  it("renders nothing on a normal (non-return) visit", () => {
    currentParams = new URLSearchParams("tab=care");
    const { container } = render(<ReturnBanner originKey="group-health" />);
    expect(container.firstChild).toBeNull();
  });

  it("does not render for a different origin's marker", () => {
    currentParams = new URLSearchParams("from=setup");
    const { container } = render(<ReturnBanner originKey="group-health" />);
    expect(container.firstChild).toBeNull();
  });
});
