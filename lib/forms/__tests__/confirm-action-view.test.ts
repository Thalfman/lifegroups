import { describe, expect, it } from "vitest";
import {
  confirmActionButtonView,
  confirmActionSubmitMode,
} from "@/lib/forms/confirm-action-view";
import { actionFail, actionOk } from "@/lib/shared/action-result";

// The confirm → submit → status lifecycle every guarded admin button shares,
// tested once (#489): copy gates the submit behind a dialog, a null message
// submits straight through, pending disables the button, and the finished
// action surfaces the standardized success / error status.

describe("confirmActionSubmitMode", () => {
  it("gates the submit behind a dialog when there is confirmation copy", () => {
    expect(confirmActionSubmitMode("Archive Bayside Men?")).toBe("confirm");
  });

  it("submits straight through when the message is null", () => {
    expect(confirmActionSubmitMode(null)).toBe("direct");
  });
});

describe("confirmActionButtonView", () => {
  const labels = { idleLabel: "Archive group", pendingLabel: "Archiving…" };

  it("shows the idle label, enabled, before the action runs", () => {
    expect(
      confirmActionButtonView({ ...labels, pending: false, state: undefined })
    ).toEqual({
      label: "Archive group",
      disabled: false,
      status: { kind: "none" },
    });
  });

  it("swaps to the pending label and disables while the action is in flight", () => {
    expect(
      confirmActionButtonView({ ...labels, pending: true, state: undefined })
    ).toEqual({
      label: "Archiving…",
      disabled: true,
      status: { kind: "none" },
    });
  });

  it("surfaces the configured success text once the action lands ok", () => {
    expect(
      confirmActionButtonView({
        ...labels,
        pending: false,
        state: actionOk({ id: "g1" }),
        successText: "Defaults restored.",
      })
    ).toEqual({
      label: "Archive group",
      disabled: false,
      status: { kind: "success", text: "Defaults restored." },
    });
  });

  it("stays silent on success for error-only flows (no successText)", () => {
    expect(
      confirmActionButtonView({
        ...labels,
        pending: false,
        state: actionOk({ id: "g1" }),
      }).status
    ).toEqual({ kind: "none" });
  });

  it("surfaces every error joined when the action fails", () => {
    expect(
      confirmActionButtonView({
        ...labels,
        pending: false,
        state: actionFail(["Group not found.", "Try again."]),
      }).status
    ).toEqual({ kind: "error", text: "Group not found. Try again." });
  });
});
