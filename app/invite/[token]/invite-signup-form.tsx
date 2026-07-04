"use client";

import { useActionState, useState } from "react";
import {
  errorTextClassName,
  fieldInputClassName,
  fieldLabelClassName,
} from "@/components/admin/forms/field-styles";
import { redeemInviteAction, type RedeemInviteState } from "./actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: RedeemInviteState = {};

const showToggleClassName =
  "absolute right-2.5 top-1/2 -translate-y-1/2 border-0 bg-transparent px-2 py-1.5 font-sans text-xs font-semibold text-ink3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50";

export function InviteSignupForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    redeemInviteAction,
    INITIAL_STATE
  );
  const [show, setShow] = useState(false);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="token" value={token} />

      <div>
        <label htmlFor="full_name" className={fieldLabelClassName}>
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          disabled={pending}
          className={`${fieldInputClassName} disabled:opacity-60`}
        />
      </div>

      <div>
        <label htmlFor="email" className={fieldLabelClassName}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          className={`${fieldInputClassName} disabled:opacity-60`}
        />
      </div>

      <div>
        <label htmlFor="password" className={fieldLabelClassName}>
          Password
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
          Confirm password
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

      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        className="w-full"
      >
        {pending ? "Creating your account…" : "Create account"}
      </Button>
    </form>
  );
}
