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

// The form binds a "use server" action; stub the module so the client render
// never pulls server-only deps.
const adminChangeLeaderRole = vi.fn(
  async (_prev: unknown, _formData: FormData) => actionOk({ id: "p1" })
);
vi.mock("@/app/(protected)/admin/people/actions", () => ({
  adminChangeLeaderRole: (prev: unknown, formData: FormData) =>
    adminChangeLeaderRole(prev, formData),
}));

import { ChangeLeaderRoleForm } from "@/components/admin/forms/change-leader-role-form";

// #666 swapped the role-downgrade `window.confirm` for the non-blocking dialog.
// The destructive direction (Leader → Co-Leader) opens the dialog; the
// promotion direction (Co-Leader → Leader) still submits straight through.
describe("ChangeLeaderRoleForm — non-blocking confirm (#666)", () => {
  afterEach(() => {
    cleanup();
    adminChangeLeaderRole.mockClear();
  });

  it("downgrade: Save opens the dialog with the preserved copy, no submit yet", async () => {
    const user = userEvent.setup();
    render(
      <ChangeLeaderRoleForm
        profileId="p1"
        profileName="Jane Leader"
        currentRole="leader"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Change role for Jane Leader" })
    );
    // Default target is the other role (co_leader) — the destructive direction.
    await user.click(screen.getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(
      "Change Jane Leader from Shepherd to Co-Shepherd? This narrows what they can do."
    );
    expect(adminChangeLeaderRole).not.toHaveBeenCalled();
  });

  it("downgrade: confirming submits the role change through the action", async () => {
    const user = userEvent.setup();
    render(
      <ChangeLeaderRoleForm
        profileId="p1"
        profileName="Jane Leader"
        currentRole="leader"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Change role for Jane Leader" })
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Change role" })
    );

    await waitFor(() => expect(adminChangeLeaderRole).toHaveBeenCalledTimes(1));
    const formData = adminChangeLeaderRole.mock.calls[0][1];
    expect(formData.get("profile_id")).toBe("p1");
    expect(formData.get("new_role")).toBe("co_leader");
  });

  it("promotion: Save submits straight through with no dialog", async () => {
    const user = userEvent.setup();
    render(
      <ChangeLeaderRoleForm
        profileId="p1"
        profileName="Pat Co-Leader"
        currentRole="co_leader"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Change role for Pat Co-Leader" })
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(adminChangeLeaderRole).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    const formData = adminChangeLeaderRole.mock.calls[0][1];
    expect(formData.get("new_role")).toBe("leader");
  });
});
