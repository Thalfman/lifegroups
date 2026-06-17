// The confirm → submit → status lifecycle that every guarded admin button
// (Archive group, Restore group, Deactivate profile, Deactivate member,
// Clear group metric overrides, Reset metric defaults) used to re-wire by
// hand (#489). The React `ConfirmActionButton` shell stays a thin projection
// of these pure decisions, so the lifecycle is testable once in the node
// environment without rendering a form.

import {
  type ActionFormState,
  type FormStatusView,
  formStatusView,
} from "@/lib/forms/action-form-view";

// The confirm gate, as a pure decision. A flow with confirmation copy submits
// only after the operator confirms in the non-blocking dialog ("confirm"); a
// `null` message needs no dialog and submits straight through ("direct").
export type ConfirmSubmitMode = "direct" | "confirm";

export function confirmActionSubmitMode(
  confirmMessage: string | null
): ConfirmSubmitMode {
  return confirmMessage === null ? "direct" : "confirm";
}

// What the button row should render for a given action state.
export type ConfirmActionButtonView = {
  // Visible button text — the pending label replaces the idle one in flight.
  label: string;
  // The button is disabled exactly while the action is in flight.
  disabled: boolean;
  // The standardized success / error line under the button.
  status: FormStatusView;
};

export function confirmActionButtonView<T>(args: {
  pending: boolean;
  idleLabel: string;
  pendingLabel: string;
  state: ActionFormState<T>;
  successText?: string;
}): ConfirmActionButtonView {
  return {
    label: args.pending ? args.pendingLabel : args.idleLabel,
    disabled: args.pending,
    status: formStatusView(args.state, args.successText),
  };
}
