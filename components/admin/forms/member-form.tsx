"use client";

import { Button } from "@/components/ui/button";
import { adminCreateMember } from "@/app/(protected)/admin/people/actions";
import {
  fieldInputClassName,
  fieldLabelClassName,
  formGridClassName,
  formNoteClassName,
} from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";

export function MemberForm() {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateMember,
    { resetOnSuccess: true }
  );

  return (
    <form ref={formRef} action={formAction} className="grid gap-3">
      <p className={formNoteClassName}>
        Members are participant records. Email and phone are optional; capture
        whatever the leader already has.
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
        <div>
          <Button type="submit" variant="solid" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add member"}
          </Button>
        </div>
      </div>
      <FormStatus state={state} successText="Member added." />
    </form>
  );
}
