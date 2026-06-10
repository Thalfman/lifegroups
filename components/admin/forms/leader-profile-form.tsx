"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { adminCreateLeaderProfile } from "@/app/(protected)/admin/people/actions";
import {
  fieldInputClassName,
  fieldLabelClassName,
  formGridClassName,
  formNoteClassName,
} from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";

export function LeaderProfileForm({
  // Supplied when rendered inside the EditingSurface drawer: `onSaved` closes
  // + refreshes once the profile is created, `onDirty` lets the drawer warn
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
    adminCreateLeaderProfile,
    { resetOnSuccess: true }
  );

  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={onDirty}
      className="grid gap-3"
    >
      <p className={formNoteClassName}>
        Creates a leader profile in the directory. Assign them to a group and
        track their care from the person&rsquo;s page.
      </p>
      <div className={formGridClassName}>
        <div>
          <label htmlFor="leader-full_name" className={fieldLabelClassName}>
            Full name
          </label>
          <input
            id="leader-full_name"
            name="full_name"
            type="text"
            required
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="Julian Example"
          />
        </div>
        <div>
          <label htmlFor="leader-email" className={fieldLabelClassName}>
            Email
          </label>
          <input
            id="leader-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="julian@example.com"
          />
        </div>
        <div>
          <label htmlFor="leader-phone" className={fieldLabelClassName}>
            Phone (optional)
          </label>
          <input
            id="leader-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="(555) 123-4567"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? "Saving…" : "Add leader"}
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
      <FormStatus state={state} successText="Leader profile added." />
    </form>
  );
}
