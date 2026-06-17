// @vitest-environment jsdom
import {
  render,
  screen,
  within,
  waitFor,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionOk } from "@/lib/shared/action-result";

// The quick action binds a "use server" action; stub the module so the client
// render never pulls server-only deps. The mock is overridden per test below.
const leaderQuickMarkDidNotMeet = vi.fn(
  async (_prev: unknown, _formData: FormData) => actionOk({ session_id: "s1" })
);
vi.mock("@/app/(protected)/leader/actions", () => ({
  leaderQuickMarkDidNotMeet: (prev: unknown, formData: FormData) =>
    leaderQuickMarkDidNotMeet(prev, formData),
}));

import { LeaderQuickDidNotMeet } from "@/components/leader/quick-did-not-meet";

// #666 swapped the leader "did not meet" quick action's blocking
// `window.confirm` for the non-blocking dialog: the click opens the dialog and
// the write fires from its confirm button.
describe("LeaderQuickDidNotMeet — non-blocking confirm (#666)", () => {
  afterEach(() => {
    cleanup();
    leaderQuickMarkDidNotMeet.mockClear();
  });

  it("opens the dialog (with the preserved copy) instead of submitting on click", async () => {
    const user = userEvent.setup();
    render(<LeaderQuickDidNotMeet groupId="g1" groupName="Bayside Men" />);

    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Group did not meet" })
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(
      "Record that Bayside Men didn't meet this week? You can update this later if anything changes."
    );
    expect(leaderQuickMarkDidNotMeet).not.toHaveBeenCalled();
  });

  it("confirming submits the form (with the group id) through the action", async () => {
    const user = userEvent.setup();
    render(<LeaderQuickDidNotMeet groupId="g1" groupName="Bayside Men" />);

    await user.click(
      screen.getByRole("button", { name: "Group did not meet" })
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Record didn't meet" })
    );

    await waitFor(() =>
      expect(leaderQuickMarkDidNotMeet).toHaveBeenCalledTimes(1)
    );
    const formData = leaderQuickMarkDidNotMeet.mock.calls[0][1];
    expect(formData.get("group_id")).toBe("g1");
  });

  it("cancelling never runs the action", async () => {
    const user = userEvent.setup();
    render(<LeaderQuickDidNotMeet groupId="g1" groupName="Bayside Men" />);

    await user.click(
      screen.getByRole("button", { name: "Group did not meet" })
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(leaderQuickMarkDidNotMeet).not.toHaveBeenCalled();
  });
});
