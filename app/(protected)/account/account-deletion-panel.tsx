"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  errorTextClassName,
  fieldLabelClassName,
} from "@/components/admin/forms/field-styles";
import {
  requestAccountDeletionAction,
  type DeletionRequestState,
} from "./actions";

const INITIAL_STATE: DeletionRequestState = {};

// Account-deletion request control (#563). Confirmation-gated; on submit the
// server action archives the profile, records the request, signs the user out,
// and redirects to the public confirmation page.
export function AccountDeletionPanel() {
  const [state, formAction, pending] = useActionState(
    requestAccountDeletionAction,
    INITIAL_STATE
  );

  return (
    <section
      aria-labelledby="delete-heading"
      className="rounded-lg border border-line bg-surface p-card md:p-7"
    >
      <h2
        id="delete-heading"
        className="m-0 mb-2 font-display text-lg font-medium text-ink"
      >
        Delete your account
      </h2>
      <p className="m-0 mb-2 font-sans text-base text-ink2">
        Requesting deletion signs you out immediately and removes your access.
        Your personal account and profile data are archived for permanent
        removal by an administrator.
      </p>
      <p className="m-0 mb-5 font-sans text-sm text-ink3">
        Care Notes and Prayer Requests you wrote are kept as part of the
        ministry&apos;s care history. Read more on the{" "}
        <a
          href="/account-deletion"
          className="font-medium text-sageDeep no-underline"
        >
          account deletion
        </a>{" "}
        page.
      </p>

      <form action={formAction} className="grid gap-4">
        <div>
          <label htmlFor="reason" className={fieldLabelClassName}>
            Reason (optional)
          </label>
          <textarea
            id="reason"
            name="reason"
            rows={3}
            maxLength={1000}
            disabled={pending}
            className="w-full rounded-sm border border-line bg-surface px-3 py-2.5 font-sans text-base text-ink placeholder:text-ink3 disabled:opacity-60"
            placeholder="Anything you'd like us to know (optional)"
          />
        </div>

        <label className="flex items-start gap-2.5 font-sans text-base text-ink2">
          <input
            type="checkbox"
            name="confirm"
            disabled={pending}
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span>
            I understand this signs me out and requests permanent deletion of my
            account.
          </span>
        </label>

        {state.error ? (
          <p role="alert" className={errorTextClassName}>
            {state.error}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="destructive"
          disabled={pending}
          className="justify-self-start"
        >
          {pending ? "Submitting…" : "Request account deletion"}
        </Button>
      </form>
    </section>
  );
}
