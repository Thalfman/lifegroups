"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { adminCreateMember } from "@/app/(protected)/admin/people/actions";
import {
  fieldHintClassName,
  fieldInputClassName,
  fieldLabelClassName,
  formGridClassName,
  formNoteClassName,
} from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";

export function MemberForm({
  // Supplied when rendered inside the EditingSurface drawer: `onSaved` closes
  // + refreshes once the member is created, `onDirty` lets the drawer warn
  // before discarding entered values, `onCancel` renders a Cancel control, and
  // `onPendingChange` lets the drawer block dismissal while the create is in
  // flight.
  onSaved,
  onDirty,
  onCancel,
  onPendingChange,
}: {
  onSaved?: () => void;
  onDirty?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
} = {}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateMember,
    { resetOnSuccess: true }
  );

  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  // Mirror New Group / Add Prospect: gate the submit on the one required field
  // (full name) and show a short inline hint until it's filled in.
  const [fullName, setFullName] = useState("");
  const canSubmit = fullName.trim().length > 0;

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={onDirty}
      className="grid gap-3"
    >
      <p className={formNoteClassName}>
        Members are participant records &mdash; they don&rsquo;t sign in. Email
        and phone are optional; capture whatever contact info you have.
      </p>
      <div className={formGridClassName}>
        <div>
          <label htmlFor="member-full_name" className={fieldLabelClassName}>
            Full name
          </label>
          <input
            id="member-full_name"
            name="full_name"
            type="text"
            required
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="Sam Member"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="member-email" className={fieldLabelClassName}>
            Email (optional)
          </label>
          <input
            id="member-email"
            name="email"
            type="email"
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="sam@example.com"
          />
        </div>
        <div>
          <label htmlFor="member-phone" className={fieldLabelClassName}>
            Phone (optional)
          </label>
          <input
            id="member-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="(555) 123-4567"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={pending || !canSubmit}
        >
          {pending ? "Saving…" : "Add member"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      {!canSubmit ? (
        <p className={fieldHintClassName}>
          Enter a full name to enable Add member.
        </p>
      ) : null}
      <FormStatus state={state} successText="Member added." />
    </form>
  );
}
