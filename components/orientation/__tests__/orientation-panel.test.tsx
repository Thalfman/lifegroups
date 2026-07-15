// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The panel persists dismissal through the audited server action; stub it so
// the test renders without pulling the "use server" chain.
vi.mock("@/app/(protected)/orientation-actions", () => ({
  markFirstRunOrientationSeenAction: vi.fn(async () => ({ ok: true })),
}));

import { markFirstRunOrientationSeenAction } from "@/app/(protected)/orientation-actions";
import { OrientationPanel } from "@/components/orientation/orientation-panel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// #906 — the concept orientation's show / dismiss / reopen state machine.
describe("OrientationPanel", () => {
  it("opens expanded on first run and explains the load-bearing concepts", () => {
    render(<OrientationPanel variant="leader" initiallySeen={false} />);

    expect(
      screen.getByRole("heading", { name: "Welcome to your care space" })
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Care Notes & Prayer Requests" })
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Who can read what you write" })
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "“Needs follow-up”" })
    ).toBeDefined();
    // The visibility copy is truthful to the ladder: transparency opens the
    // notes to ministry leadership, and the Ministry Admin's own private note
    // is hidden even from the Super Admin.
    expect(screen.getByText(/turns on transparency for you/)).toBeDefined();
    expect(screen.getByText(/not even the Super Admin/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Got it" })).toBeDefined();
  });

  it("varies the coverage-scoped copy for the Over-Shepherd surface", () => {
    render(<OrientationPanel variant="over_shepherd" initiallySeen={false} />);

    expect(
      screen.getByRole("heading", { name: "Your coverage" })
    ).toBeDefined();
    expect(
      screen.getByText(/that Shepherd's transparency toggle is on/)
    ).toBeDefined();
  });

  it("dismisses via Got it: persists once and collapses to the reopen button", async () => {
    const user = userEvent.setup();
    render(<OrientationPanel variant="leader" initiallySeen={false} />);

    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(markFirstRunOrientationSeenAction).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("heading", { name: "Welcome to your care space" })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "View orientation" })
    ).toBeDefined();
  });

  it("starts collapsed when already seen and reopens without re-firing the action", async () => {
    const user = userEvent.setup();
    render(<OrientationPanel variant="leader" initiallySeen={true} />);

    expect(
      screen.queryByRole("heading", { name: "Welcome to your care space" })
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "View orientation" }));
    expect(
      screen.getByRole("heading", { name: "Welcome to your care space" })
    ).toBeDefined();
    // A reopened panel closes with a plain Close — no second persistence write.
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.getByRole("button", { name: "View orientation" })
    ).toBeDefined();
    expect(markFirstRunOrientationSeenAction).not.toHaveBeenCalled();
  });

  it("keeps Close (not Got it) after a dismiss-then-reopen in the same visit", async () => {
    const user = userEvent.setup();
    render(<OrientationPanel variant="leader" initiallySeen={false} />);

    await user.click(screen.getByRole("button", { name: "Got it" }));
    await user.click(screen.getByRole("button", { name: "View orientation" }));

    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Got it" })).toBeNull();
    expect(markFirstRunOrientationSeenAction).toHaveBeenCalledTimes(1);
  });
});
