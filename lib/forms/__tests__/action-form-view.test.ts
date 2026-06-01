import { describe, it, expect } from "vitest";
import { formStatusView } from "@/lib/forms/action-form-view";
import { actionOk, actionFail } from "@/lib/shared/action-result";

describe("formStatusView", () => {
  it("renders nothing before the action has run", () => {
    expect(formStatusView(undefined, "Saved.")).toEqual({ kind: "none" });
  });

  it("renders the success text on ok", () => {
    expect(formStatusView(actionOk({ id: "g1" }), "Saved.")).toEqual({
      kind: "success",
      text: "Saved.",
    });
  });

  it("renders nothing on ok when the form declares no success text", () => {
    // Error-only forms (archive, deactivate, …) pass no successText.
    expect(formStatusView(actionOk({ id: "g1" }))).toEqual({ kind: "none" });
  });

  it("joins every error rather than showing only the first", () => {
    // The drift this module exists to kill: errors[0] dropped later errors.
    expect(
      formStatusView(actionFail(["Name is required.", "Email is invalid."]))
    ).toEqual({ kind: "error", text: "Name is required. Email is invalid." });
  });
});
