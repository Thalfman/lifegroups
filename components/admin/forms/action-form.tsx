"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/shared/action-result";
import {
  type ActionFormState,
  type FormStatusView,
  formStatusView,
} from "@/lib/forms/action-form-view";
import { errorTextClassName, successTextClassName } from "./field-styles";

// The wiring every server-action form repeated by hand: bind `useActionState`,
// expose `pending`, and (for 14 forms) reset the form on success. One small
// interface, one place to test, instead of 48 copies.
export type ServerAction<T> = (
  prev: ActionFormState<T>,
  formData: FormData
) => Promise<ActionResult<T>>;

export function useActionForm<T>(
  action: ServerAction<T>,
  options: { resetOnSuccess?: boolean } = {}
) {
  const [state, formAction, pending] = useActionState<
    ActionFormState<T>,
    FormData
  >(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  const resetOnSuccess = options.resetOnSuccess ?? false;
  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return { state, formAction, pending, formRef };
}

// Thin projection of a precomputed status view — for modules (e.g.
// ConfirmActionButton) that already derive the view as part of a larger
// lifecycle. Most forms want `FormStatus` below instead.
export function FormStatusLine({ view }: { view: FormStatusView }) {
  if (view.kind === "none") return null;
  if (view.kind === "success")
    return <span className={successTextClassName}>{view.text}</span>;
  return <p className={errorTextClassName}>{view.text}</p>;
}

// The standardized success / error line. Pass `successText` to show a sage
// confirmation on ok; omit it for error-only forms. Errors are always shown
// in full (see formStatusView).
export function FormStatus<T>({
  state,
  successText,
}: {
  state: ActionFormState<T>;
  successText?: string;
}) {
  return <FormStatusLine view={formStatusView(state, successText)} />;
}
