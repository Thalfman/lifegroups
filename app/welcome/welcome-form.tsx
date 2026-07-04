"use client";

import { useActionState } from "react";
import {
  errorTextClassName,
  fieldInputClassName,
  fieldLabelClassName,
} from "@/components/admin/forms/field-styles";
import { chooseNameAction, type ChooseNameState } from "./actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: ChooseNameState = {};

export function WelcomeForm({ namePrefill }: { namePrefill: string }) {
  const [state, formAction, pending] = useActionState(
    chooseNameAction,
    INITIAL_STATE
  );

  return (
    <form action={formAction} className="grid gap-4">
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
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
