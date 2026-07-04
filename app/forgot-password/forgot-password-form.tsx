"use client";

import { useActionState } from "react";
import {
  errorTextClassName,
  fieldInputClassName,
  fieldLabelClassName,
  successTextClassName,
} from "@/components/admin/forms/field-styles";
import { forgotPasswordAction, type ForgotPasswordState } from "./actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    INITIAL_STATE
  );

  if (state.submitted) {
    // Info status note: soft sage bg + deep sage fg, no stripe.
    return (
      <div role="status" className={successTextClassName}>
        If an account exists for that email, a reset link has been sent.
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      <div>
        <label htmlFor="email" className={fieldLabelClassName}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          disabled={pending}
          className={`${fieldInputClassName} disabled:opacity-60`}
        />
      </div>

      {state.error ? (
        <p role="alert" className={errorTextClassName}>
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        className="w-full"
      >
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
