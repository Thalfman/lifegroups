// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// Capture the shared host's openAction so we can assert the row menu hands it
// the right { entity, action } without mounting the whole provider.
const openAction = vi.fn();
vi.mock("@/components/lg/admin/contextual-action-provider", () => ({
  useContextualAction: () => ({ openAction }),
}));

import { CareAttentionQueue } from "@/components/admin/shepherd-care/care-attention-queue";
import type { CareAttentionItem } from "@/lib/admin/shepherd-care-dashboard";

const ITEM: CareAttentionItem = {
  shepherdProfileId: "ldr-1",
  shepherdName: "Sam Carter",
  reason: "overdue_touchpoint",
  secondaryReasons: [],
  detail: "No contact in 42 days",
  priority: 1,
  href: "/admin/shepherd-care/ldr-1",
};

afterEach(() => {
  cleanup();
  openAction.mockReset();
});

// #781 OPP-7 — the dashboard attention queue acts in place.
describe("CareAttentionQueue contextual actions", () => {
  it("offers the per-leader action menu for an admin viewer and opens an action in place", async () => {
    const user = userEvent.setup();
    render(
      <CareAttentionQueue
        items={[ITEM]}
        totalCount={1}
        viewerRole="ministry_admin"
      />
    );

    // The leader name still links to the care page (navigational half intact).
    const link = screen.getByRole("link", { name: /Sam Carter/ });
    expect(link.getAttribute("href")).toBe("/admin/shepherd-care/ldr-1");

    await user.click(
      screen.getByRole("button", { name: "Care actions for Sam Carter" })
    );
    await user.click(await screen.findByText("Log call"));
    expect(openAction).toHaveBeenCalledWith({
      entity: { kind: "leader", id: "ldr-1", label: "Sam Carter" },
      action: expect.objectContaining({ id: "log_call" }),
    });
  });

  it("renders no action menu without a viewer role", () => {
    render(<CareAttentionQueue items={[ITEM]} totalCount={1} />);
    expect(screen.queryByRole("button", { name: /Care actions/ })).toBeNull();
    // The row is still navigable.
    expect(screen.getByRole("link", { name: /Sam Carter/ })).toBeTruthy();
  });
});
