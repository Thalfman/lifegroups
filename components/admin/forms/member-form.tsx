"use client";

import { PButton } from "@/components/pastoral/button";
import { adminCreateMember } from "@/app/(protected)/admin/people/actions";
import {
  fieldInputStyle,
  fieldLabelStyle,
  formGridStyle,
  formNoteStyle,
} from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";

export function MemberForm() {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateMember,
    { resetOnSuccess: true }
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      style={{ display: "grid", gap: 12 }}
    >
      <p style={formNoteStyle}>
        Members are participant records. Email and phone are optional; capture
        whatever the leader already has.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="member-full_name" style={fieldLabelStyle}>
            Full name
          </label>
          <input
            id="member-full_name"
            name="full_name"
            type="text"
            required
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="Sam Member"
          />
        </div>
        <div>
          <label htmlFor="member-email" style={fieldLabelStyle}>
            Email (optional)
          </label>
          <input
            id="member-email"
            name="email"
            type="email"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="sam@example.com"
          />
        </div>
        <div>
          <label htmlFor="member-phone" style={fieldLabelStyle}>
            Phone (optional)
          </label>
          <input
            id="member-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="(555) 123-4567"
          />
        </div>
        <div>
          <PButton type="submit" tone="solid" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add member"}
          </PButton>
        </div>
      </div>
      <FormStatus state={state} successText="Member added." />
    </form>
  );
}
