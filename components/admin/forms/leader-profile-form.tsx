"use client";

import { Button } from "@/components/ui/button";
import { adminCreateLeaderProfile } from "@/app/(protected)/admin/people/actions";
import {
  fieldInputClassName,
  fieldLabelClassName,
  formGridClassName,
  formNoteClassName,
} from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";

export function LeaderProfileForm() {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateLeaderProfile,
    { resetOnSuccess: true }
  );

  return (
    <form ref={formRef} action={formAction} className="grid gap-3">
      <p className={formNoteClassName}>
        Creates a leader profile in the directory. Place them in a group and
        track their care from the person&rsquo;s tabs.
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
        <div>
          <Button type="submit" variant="solid" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add leader"}
          </Button>
        </div>
      </div>
      <FormStatus state={state} successText="Leader profile added." />
    </form>
  );
}
