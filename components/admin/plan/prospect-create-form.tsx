"use client";

import { useEffect, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { useValueChange } from "@/lib/hooks/use-value-change";
import { adminCreateProspect } from "@/app/(protected)/admin/plan/actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { FULL_NAME_REQUIRED_MESSAGE } from "@/lib/admin/validation/prospect-form-client";
import { GroupTypePicker } from "@/components/admin/forms/group-type-picker";
import {
  fieldLabelClassName as LABEL,
  fieldInputBaseClassName as INPUT,
} from "@/components/admin/forms/field-styles";

// Add a Prospect to the funnel (acceptance #2). A new Prospect always lands in
// Interested with no group — the state machine moves them onward from there.
// `groupTypes` is the admin-managed list backing the optional desired-type
// dropdown (#746); an empty list (e.g. a degraded types read) just renders the
// "—" no-selection option alone.
export function ProspectCreateForm({
  groupTypes = [],
}: {
  groupTypes?: readonly string[];
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateProspect,
    { resetOnSuccess: true }
  );

  const [fullName, setFullName] = useState("");

  // Native `required` on the Full name field blocks an empty submit and moves
  // focus, but that alone is too quiet (no app-level message). We surface a
  // visible, accessible message via the field's `onInvalid` (which fires from
  // the native constraint pass) without taking over submission — native still
  // gates the empty case, we only upgrade the messaging.
  const [fullNameError, setFullNameError] = useState<string | undefined>(
    undefined
  );

  // The "Prospect added." confirmation auto-dismisses. Otherwise it lingered as
  // a stale message at the top of the board after a later action on a different
  // card (e.g. moving a prospect), since this create form is a separate
  // persistent client component whose useActionState success state isn't cleared
  // by the board's revalidation.
  const [showSuccess, setShowSuccess] = useState(false);

  // useActionForm resets the <form> element on success; the desired-type select
  // is uncontrolled, so the native reset clears it. Only the controlled Full name
  // field needs explicit clearing here. Derived during render via useValueChange
  // (a fresh `state` object each submit) rather than in an effect to avoid the
  // cascading-render smell; this also raises the success flag.
  useValueChange(state, (next) => {
    if (!next?.ok) return;
    setFullName("");
    setFullNameError(undefined);
    setShowSuccess(true);
  });

  // Auto-dismiss the success flash after 5s. Keyed on the action result so a
  // back-to-back success restarts the window; the only setState here lives in
  // the timer callback, not the effect body.
  useEffect(() => {
    if (!state?.ok) return;
    const timer = setTimeout(() => setShowSuccess(false), 5000);
    return () => clearTimeout(timer);
  }, [state]);

  const canSubmit = fullName.trim().length > 0;

  return (
    <form ref={formRef} action={formAction} className="grid gap-3">
      <p className="m-0 mb-3 font-sans text-sm leading-normal text-ink2">
        Only the name is required. New prospects start as <em>Interested</em>;
        move them to Matched once you have a group.
      </p>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] md:gap-3.5">
        <div>
          <label htmlFor="prospect-full_name" className={LABEL}>
            Full name
          </label>
          <input
            id="prospect-full_name"
            name="full_name"
            type="text"
            required
            value={fullName}
            aria-required="true"
            aria-invalid={fullNameError ? "true" : undefined}
            aria-describedby="prospect-full_name-error"
            onInvalid={(e) => {
              // Suppress the native bubble and show our own accessible message;
              // the field stays invalid, so native still blocks the submit.
              e.preventDefault();
              setFullNameError(FULL_NAME_REQUIRED_MESSAGE);
            }}
            onInput={() => {
              if (fullNameError) setFullNameError(undefined);
            }}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="off"
            className={INPUT}
            placeholder="Avery Bennett"
          />
          {/* Stable live region: kept mounted (hidden when clear) so the
              aria-describedby target is constant and role="alert" announces the
              message when validation populates it. */}
          <p
            id="prospect-full_name-error"
            role="alert"
            className="mb-0 mt-1.5 font-sans text-sm text-rose"
            hidden={!fullNameError}
          >
            {fullNameError}
          </p>
        </div>
        <div>
          <label htmlFor="prospect-email" className={LABEL}>
            Email (optional)
          </label>
          <input
            id="prospect-email"
            name="email"
            type="email"
            autoComplete="off"
            className={INPUT}
            placeholder="avery@example.com"
          />
        </div>
        <div>
          <label htmlFor="prospect-phone" className={LABEL}>
            Phone (optional)
          </label>
          <input
            id="prospect-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            className={INPUT}
            placeholder="(555) 555-0100"
          />
        </div>
        {/* #747: the picker is the existing-types dropdown plus an inline
            "＋ Add new type…" affordance; it posts via name="desired_group_type"
            and clears itself on the form's success reset. */}
        <GroupTypePicker groupTypes={groupTypes} />
        <div>
          <PButton
            type="submit"
            tone="terra"
            size="md"
            disabled={pending || !canSubmit}
          >
            {pending ? "Saving…" : "Add prospect"}
          </PButton>
          {!canSubmit ? (
            <p className="m-0 mt-1.5 font-sans text-sm text-ink3">
              Enter a full name to enable Add prospect.
            </p>
          ) : null}
        </div>
      </div>
      {/* successText is withheld once the timer fires so the confirmation
          auto-dismisses; errors (state not ok) always show. */}
      <FormStatus
        state={state}
        successText={showSuccess ? "Prospect added." : undefined}
      />
    </form>
  );
}
