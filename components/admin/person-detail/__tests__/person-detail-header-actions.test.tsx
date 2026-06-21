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

// Stub the "use server" people actions so the client render never pulls
// server-only deps; capture calls to assert the audited write path.
const adminDeactivateProfile = vi.fn(
  async (_prev: unknown, _formData: FormData) => actionOk({ id: "p1" })
);
const adminDeactivateMember = vi.fn(
  async (_prev: unknown, _formData: FormData) => actionOk({ id: "m1" })
);
const adminChangeLeaderRole = vi.fn(
  async (_prev: unknown, _formData: FormData) => actionOk({ id: "p1" })
);
vi.mock("@/app/(protected)/admin/people/actions", () => ({
  adminDeactivateProfile: (prev: unknown, formData: FormData) =>
    adminDeactivateProfile(prev, formData),
  adminDeactivateMember: (prev: unknown, formData: FormData) =>
    adminDeactivateMember(prev, formData),
  adminChangeLeaderRole: (prev: unknown, formData: FormData) =>
    adminChangeLeaderRole(prev, formData),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { PersonDetailHeaderActions } from "@/components/admin/person-detail/person-detail-header-actions";

afterEach(() => {
  cleanup();
  adminDeactivateProfile.mockClear();
  adminDeactivateMember.mockClear();
  adminChangeLeaderRole.mockClear();
  refresh.mockClear();
});

// #781 OPP-6 — the person detail-header action menu.
describe("PersonDetailHeaderActions", () => {
  it("offers Change role + Archive for an active leader", async () => {
    const user = userEvent.setup();
    render(
      <PersonDetailHeaderActions
        person={{
          kind: "profile",
          id: "p1",
          fullName: "Dana Leader",
          status: "active",
          leaderRole: "leader",
        }}
        viewerRole="ministry_admin"
      />
    );
    await user.click(
      screen.getByRole("button", { name: "Actions for Dana Leader" })
    );
    expect(await screen.findByText("Change role")).toBeTruthy();
    expect(screen.getByText("Archive")).toBeTruthy();
  });

  it("omits Change role for a member, keeping Archive", async () => {
    const user = userEvent.setup();
    render(
      <PersonDetailHeaderActions
        person={{
          kind: "member",
          id: "m1",
          fullName: "Morgan Member",
          status: "active",
          leaderRole: null,
        }}
        viewerRole="ministry_admin"
      />
    );
    await user.click(
      screen.getByRole("button", { name: "Actions for Morgan Member" })
    );
    expect(await screen.findByText("Archive")).toBeTruthy();
    expect(screen.queryByText("Change role")).toBeNull();
  });

  it("renders no menu at all for an already-archived person", () => {
    render(
      <PersonDetailHeaderActions
        person={{
          kind: "profile",
          id: "p1",
          fullName: "Dana Leader",
          status: "inactive",
          leaderRole: "leader",
        }}
        viewerRole="ministry_admin"
      />
    );
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  });

  it("archives a member through the audited deactivate action and refreshes", async () => {
    const user = userEvent.setup();
    render(
      <PersonDetailHeaderActions
        person={{
          kind: "member",
          id: "m1",
          fullName: "Morgan Member",
          status: "active",
          leaderRole: null,
        }}
        viewerRole="ministry_admin"
      />
    );
    await user.click(
      screen.getByRole("button", { name: "Actions for Morgan Member" })
    );
    await user.click(await screen.findByText("Archive"));
    // The drawer body's Archive button (confirm-gated) — open then confirm.
    await user.click(
      await screen.findByRole("button", { name: "Archive Morgan Member" })
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(adminDeactivateMember).toHaveBeenCalledTimes(1));
    const formData = adminDeactivateMember.mock.calls[0][1] as FormData;
    expect(formData.get("member_id")).toBe("m1");
    expect(adminDeactivateProfile).not.toHaveBeenCalled();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("renders no menu when the admin is viewing their own profile (#788 self-target)", () => {
    render(
      <PersonDetailHeaderActions
        person={{
          kind: "profile",
          id: "p1",
          fullName: "Dana Leader",
          status: "active",
          leaderRole: "leader",
        }}
        viewerRole="ministry_admin"
        isSelf
      />
    );
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  });

  it("renders no menu for a non-admin viewer", () => {
    render(
      <PersonDetailHeaderActions
        person={{
          kind: "profile",
          id: "p1",
          fullName: "Dana Leader",
          status: "active",
          leaderRole: "leader",
        }}
        viewerRole="leader"
      />
    );
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  });
});
