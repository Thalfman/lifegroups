"use client";

import { useActionState, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  errorTextClassName,
  fieldInputClassName,
  fieldLabelClassName,
} from "@/components/admin/forms/field-styles";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

const INITIAL_STATE: ResetPasswordState = {};

const showToggleClassName =
  "absolute right-2.5 top-1/2 -translate-y-1/2 border-0 bg-transparent px-2 py-1.5 font-sans text-xs font-semibold text-ink3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50";

export function ResetPasswordForm({
  namePending,
  namePrefill,
}: {
  // Choose-your-name step (ADR 0025): when the profile's name is still
  // pending, the person picks it here alongside their password. namePrefill
  // carries an existing name (the relink case) to confirm or edit.
  namePending: boolean;
  namePrefill: string;
}) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    INITIAL_STATE
  );
  const [show, setShow] = useState(false);

  return (
    <form action={formAction} className="grid gap-4">
      {namePending ? (
        <div>
          <label htmlFor="full_name" className={fieldLabelClassName}>
            Your name
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            autoComplete="name"
            required
            maxLength={200}
            defaultValue={namePrefill}
            disabled={pending}
            className={`${fieldInputClassName} disabled:opacity-60`}
          />
        </div>
      ) : null}

      <div>
        <label htmlFor="password" className={fieldLabelClassName}>
          {namePending ? "Password" : "New password"}
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            disabled={pending}
            className={`${fieldInputClassName} pr-20 disabled:opacity-60`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            disabled={pending}
            aria-label={show ? "Hide password" : "Show password"}
            className={showToggleClassName}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="confirm" className={fieldLabelClassName}>
          {namePending ? "Confirm password" : "Confirm new password"}
        </label>
        <input
          id="confirm"
          name="confirm"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={8}
          disabled={pending}
          className={`${fieldInputClassName} disabled:opacity-60`}
        />
      </div>

      {state.error ? (
        <p role="alert" className={errorTextClassName}>
          {state.error}
        </p>
      ) : null}

      <PButton type="submit" tone="terra" disabled={pending} className="w-full">
        {pending ? "Saving…" : namePending ? "Finish setup" : "Update password"}
      </PButton>
    </form>
  );
}
