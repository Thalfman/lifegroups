// The single result-rendering contract shared by every server-action form.
//
// Before this module each form re-decided how to show a finished action: 16
// rendered `state.errors[0]` (silently dropping every error after the first),
// 14 rendered `state.errors.join(" ")`, and the success/empty branches were
// copied by hand 48 times. `formStatusView` owns that decision once so the
// React `<FormStatus>` shell stays a thin projection of a pure value — which
// also lets the contract be tested in the node test environment without RTL.

import type { ActionResult } from "@/lib/shared/action-result";

// The `useActionState` slot for a form: undefined until the action first runs.
export type ActionFormState<T> = ActionResult<T> | undefined;

// What the status line should render for a given action state. `none` covers
// both "not run yet" and "succeeded but this form shows no success text".
export type FormStatusView =
  | { kind: "none" }
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

// Errors are always joined — never truncated to the first — so a form can
// never silently hide a validation error again.
export function formStatusView<T>(
  state: ActionFormState<T>,
  successText?: string
): FormStatusView {
  if (!state) return { kind: "none" };
  if (state.ok) {
    return successText
      ? { kind: "success", text: successText }
      : { kind: "none" };
  }
  return { kind: "error", text: state.errors.join(" ") };
}
