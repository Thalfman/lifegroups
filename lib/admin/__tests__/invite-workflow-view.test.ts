import { describe, expect, it } from "vitest";
import {
  inviteEmailSuccessReset,
  inviteGroupVisible,
  inviteResultLine,
  inviteSubmitRoute,
  inviteWorkflowButtonsView,
  namedLinkOutcome,
  shareLinkDescription,
  shareLinkOutcome,
  shareLinkPayload,
  type CreateInviteLinkSuccess,
  type InviteUserSuccess,
} from "@/lib/admin/invite-workflow-view";
import { actionFail, actionOk } from "@/lib/shared/action-result";

// The invite workflow's state choreography, tested once as pure values
// (ADR 0039): payload assembly and group/expiry gating, settlement of the two
// imperative server-action calls, the success reset, and the button views the
// shell projects.

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

const SHARE_SUCCESS: CreateInviteLinkSuccess = {
  url: "https://example.com/invite/abc",
  role: "leader",
  singleUse: true,
  expiresAt: "2026-07-14T12:00:00.000Z",
};

describe("shareLinkPayload", () => {
  it("carries the group for a group-assignable role with a preset expiry", () => {
    expect(
      shareLinkPayload({
        role: "leader",
        groupId: "group-1",
        expiryPreset: "7d",
        customExpiry: "",
        singleUse: true,
      })
    ).toEqual({
      role: "leader",
      expiry_preset: "7d",
      single_use: "true",
      group_id: "group-1",
    });
  });

  it("drops a stale group id when the role is not group-assignable", () => {
    expect(
      shareLinkPayload({
        role: "ministry_admin",
        groupId: "group-1",
        expiryPreset: "7d",
        customExpiry: "",
        singleUse: true,
      })
    ).not.toHaveProperty("group_id");
  });

  it("omits the group when none is picked", () => {
    expect(
      shareLinkPayload({
        role: "leader",
        groupId: "",
        expiryPreset: "7d",
        customExpiry: "",
        singleUse: true,
      })
    ).not.toHaveProperty("group_id");
  });

  it("resolves a custom expiry to an absolute ISO timestamp", () => {
    const payload = shareLinkPayload({
      role: "over_shepherd",
      groupId: "",
      expiryPreset: "custom",
      customExpiry: "2026-08-01T12:30",
      singleUse: true,
    });
    // datetime-local is a wall-clock string parsed in the local zone; compare
    // against the same conversion so the test is timezone-safe.
    expect(payload.expires_at).toBe(new Date("2026-08-01T12:30").toISOString());
  });

  it("omits expires_at when the custom preset has no value yet", () => {
    expect(
      shareLinkPayload({
        role: "leader",
        groupId: "",
        expiryPreset: "custom",
        customExpiry: "",
        singleUse: true,
      })
    ).not.toHaveProperty("expires_at");
  });

  it("serializes multi-use links as single_use false", () => {
    expect(
      shareLinkPayload({
        role: "leader",
        groupId: "",
        expiryPreset: "24h",
        customExpiry: "",
        singleUse: false,
      }).single_use
    ).toBe("false");
  });
});

describe("namedLinkOutcome", () => {
  it("joins every error on failure", () => {
    expect(namedLinkOutcome(actionFail(["a", "b"]))).toEqual({
      kind: "error",
      message: "a b",
    });
  });

  it("surfaces the copyable link for a newly-invited user", () => {
    const res = actionOk(
      inviteUserSuccess({ inviteLink: "https://example.com/setup/xyz" })
    );
    expect(namedLinkOutcome(res)).toEqual({
      kind: "link",
      url: "https://example.com/setup/xyz",
    });
  });

  it("explains the reused-login case, where no link exists", () => {
    const res = actionOk(
      inviteUserSuccess({ authUserState: "existing_reused" })
    );
    expect(namedLinkOutcome(res)).toEqual({
      kind: "existing_reused",
      note: "Existing login reused: no invite link to copy. Ask them to use Forgot password to set a new password.",
    });
  });
});

describe("shareLinkOutcome", () => {
  it("joins every error on failure", () => {
    expect(shareLinkOutcome(actionFail(["x", "y"]))).toEqual({
      kind: "error",
      message: "x y",
    });
  });

  it("passes the created link through on success", () => {
    expect(shareLinkOutcome(actionOk(SHARE_SUCCESS))).toEqual({
      kind: "created",
      value: SHARE_SUCCESS,
    });
  });
});

describe("inviteEmailSuccessReset", () => {
  it("does nothing before the action first runs", () => {
    expect(inviteEmailSuccessReset(undefined)).toBeNull();
  });

  it("does nothing on failure", () => {
    expect(inviteEmailSuccessReset(actionFail(["nope"]))).toBeNull();
  });

  it("returns the default role and cleared group on success", () => {
    expect(inviteEmailSuccessReset(actionOk(inviteUserSuccess()))).toEqual({
      role: "leader",
      groupId: "",
    });
  });
});

describe("inviteGroupVisible", () => {
  it("shows the group picker for the two group-scoped roles only", () => {
    expect(inviteGroupVisible("leader")).toBe(true);
    expect(inviteGroupVisible("co_leader")).toBe(true);
    expect(inviteGroupVisible("ministry_admin")).toBe(false);
    expect(inviteGroupVisible("over_shepherd")).toBe(false);
  });
});

describe("inviteSubmitRoute", () => {
  it("submits the email path through the form action", () => {
    expect(inviteSubmitRoute("email")).toBe("form_action");
  });

  it("routes link-mode submissions to the generate handler", () => {
    expect(inviteSubmitRoute("link")).toBe("share_link");
  });
});

describe("inviteWorkflowButtonsView", () => {
  it("shows the idle labels, all enabled, before anything pends", () => {
    expect(
      inviteWorkflowButtonsView({
        emailPending: false,
        namedLinkPending: false,
        sharePending: false,
      })
    ).toEqual({
      sendInvite: { label: "Send invite", disabled: false },
      copyInviteLink: { label: "Copy invite link", disabled: false },
      generateShareLink: { label: "Generate link", disabled: false },
    });
  });

  it("disables both email-path buttons while the invite sends", () => {
    const view = inviteWorkflowButtonsView({
      emailPending: true,
      namedLinkPending: false,
      sharePending: false,
    });
    expect(view.sendInvite).toEqual({
      label: "Sending invite…",
      disabled: true,
    });
    expect(view.copyInviteLink.disabled).toBe(true);
    expect(view.generateShareLink.disabled).toBe(false);
  });

  it("disables both email-path buttons while the named link generates", () => {
    const view = inviteWorkflowButtonsView({
      emailPending: false,
      namedLinkPending: true,
      sharePending: false,
    });
    expect(view.copyInviteLink).toEqual({
      label: "Generating link…",
      disabled: true,
    });
    expect(view.sendInvite.disabled).toBe(true);
  });

  it("pends the share button independently of the email path", () => {
    const view = inviteWorkflowButtonsView({
      emailPending: false,
      namedLinkPending: false,
      sharePending: true,
    });
    expect(view.generateShareLink).toEqual({
      label: "Generating…",
      disabled: true,
    });
    expect(view.sendInvite.disabled).toBe(false);
    expect(view.copyInviteLink.disabled).toBe(false);
  });
});

describe("inviteResultLine", () => {
  it("pairs the auth-user and group-assignment states", () => {
    expect(inviteResultLine(inviteUserSuccess())).toBe(
      "invite email sent; group assignment created."
    );
  });

  it("covers the reused-login, already-assigned variant", () => {
    expect(
      inviteResultLine(
        inviteUserSuccess({
          authUserState: "existing_reused",
          groupAssignmentState: "already_active",
        })
      )
    ).toBe("existing login reused; group assignment already active.");
  });
});

describe("shareLinkDescription", () => {
  it("describes a single-use link with its expiry", () => {
    const text = shareLinkDescription(SHARE_SUCCESS);
    expect(text).toContain("sets their own login as Shepherd, single use.");
    expect(text).toContain(
      `Expires ${new Date(SHARE_SUCCESS.expiresAt).toLocaleString()}.`
    );
  });

  it("describes a reusable link", () => {
    expect(
      shareLinkDescription({ ...SHARE_SUCCESS, singleUse: false })
    ).toContain(", reusable until it expires.");
  });
});
