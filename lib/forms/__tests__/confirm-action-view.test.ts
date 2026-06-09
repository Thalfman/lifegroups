import { describe, expect, it, vi } from "vitest";
import {
  confirmActionButtonView,
  gateSubmitOnConfirm,
} from "@/lib/forms/confirm-action-view";
import { actionFail, actionOk } from "@/lib/shared/action-result";

// The confirm → submit → status lifecycle every guarded admin button shares,
// tested once (#489): cancel blocks the submit, confirm lets it through,
// pending disables the button, and the finished action surfaces the
// standardized success / error status.

describe("gateSubmitOnConfirm", () => {
  it("blocks the form submit when the operator cancels the dialog", () => {
    const event = { preventDefault: vi.fn() };
    expect(gateSubmitOnConfirm(false, event)).toBe("block");
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("lets the form submit through when the operator confirms", () => {
    const event = { preventDefault: vi.fn() };
    expect(gateSubmitOnConfirm(true, event)).toBe("submit");
    expect(event.preventDefault).not.toHaveBeenCalled();
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
