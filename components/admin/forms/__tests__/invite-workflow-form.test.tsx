// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionFail, actionOk } from "@/lib/shared/action-result";
import type { InviteUserSuccess } from "@/lib/admin/invite-workflow-view";

// The form binds two "use server" action modules; stub them so the client
// render never pulls server-only deps. The choreography itself is pure and
// tested in lib/admin/__tests__/invite-workflow-view.test.ts (ADR 0039) —
// these cases cover only the residual wiring: that each settled outcome lands
// in the right state slot and the delivery toggle routes the submit.
const superAdminInviteUser = vi.fn(
  async (_prev: unknown, _formData: FormData) =>
    actionFail(["not expected in these tests"])
);
const superAdminGenerateInviteLink = vi.fn(async (_formData: FormData) =>
  actionFail(["stub me per test"])
);
vi.mock("@/app/(protected)/admin/super-admin/invite-user-actions", () => ({
  superAdminInviteUser: (prev: unknown, formData: FormData) =>
    superAdminInviteUser(prev, formData),
  superAdminGenerateInviteLink: (formData: FormData) =>
    superAdminGenerateInviteLink(formData),
}));

const superAdminCreateInviteLink = vi.fn(
  async (_payload: Record<string, unknown>) => actionFail(["stub me per test"])
);
vi.mock("@/app/(protected)/admin/super-admin/invite-link-actions", () => ({
  superAdminCreateInviteLink: (payload: Record<string, unknown>) =>
    superAdminCreateInviteLink(payload),
}));

// jsdom has no clipboard; resolve as copied.
vi.mock("@/lib/shared/copy-to-clipboard", () => ({
  copyToClipboard: async () => true,
}));

import { InviteWorkflowForm } from "@/components/admin/forms/invite-workflow-form";

const GROUPS = [{ id: "group-1", name: "Bayside Men" }];

function inviteUserSuccess(
  overrides: Partial<InviteUserSuccess> = {}
): InviteUserSuccess {
  return {
    profileId: "profile-1",
    email: "sam@example.com",
    role: "leader",
    authUserState: "invited",
    groupAssignmentState: "created",
    warnings: [],
    ...overrides,
  };
}

describe("InviteWorkflowForm — wiring", () => {
  afterEach(() => {
    cleanup();
    superAdminInviteUser.mockClear();
    superAdminGenerateInviteLink.mockClear();
    superAdminCreateInviteLink.mockClear();
  });

  it("link mode: Generate link calls the action with the assembled payload and renders the URL", async () => {
    superAdminCreateInviteLink.mockResolvedValueOnce(
      actionOk({
        url: "https://example.com/invite/abc",
        role: "leader",
        singleUse: true,
        expiresAt: "2026-07-14T12:00:00.000Z",
      })
    );
    const user = userEvent.setup();
    render(<InviteWorkflowForm groups={GROUPS} />);

    await user.click(
      screen.getByRole("radio", { name: "Generate shareable link" })
    );
    await user.click(screen.getByRole("button", { name: "Generate link" }));

    await waitFor(() =>
      expect(superAdminCreateInviteLink).toHaveBeenCalledTimes(1)
    );
    expect(superAdminCreateInviteLink.mock.calls[0][0]).toEqual({
      role: "leader",
      expiry_preset: "7d",
      single_use: "true",
    });
    expect(
      await screen.findByRole("textbox", { name: "Invite link" })
    ).toHaveProperty("value", "https://example.com/invite/abc");
    // The link path never submits through the email-path form action.
    expect(superAdminInviteUser).not.toHaveBeenCalled();
  });

  it("named link: a reused login renders the no-link note instead of a link", async () => {
    superAdminGenerateInviteLink.mockResolvedValueOnce(
      actionOk(inviteUserSuccess({ authUserState: "existing_reused" }))
    );
    const user = userEvent.setup();
    render(<InviteWorkflowForm groups={GROUPS} />);

    await user.type(
      screen.getByRole("textbox", { name: "Email" }),
      "sam@example.com"
    );
    await user.click(screen.getByRole("button", { name: "Copy invite link" }));

    expect(
      await screen.findByText(
        "Existing login reused: no invite link to copy. Ask them to use Forgot password to set a new password."
      )
    ).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Invite link" })).toBeNull();
  });

  it("named link: a failed action renders every error joined", async () => {
    superAdminGenerateInviteLink.mockResolvedValueOnce(actionFail(["x", "y"]));
    const user = userEvent.setup();
    render(<InviteWorkflowForm groups={GROUPS} />);

    await user.type(
      screen.getByRole("textbox", { name: "Email" }),
      "sam@example.com"
    );
    await user.click(screen.getByRole("button", { name: "Copy invite link" }));

    expect(await screen.findByText("x y")).toBeTruthy();
  });
});
