"use client";

import { PButton } from "@/components/pastoral/button";
import { adminCreateLeaderProfile } from "@/app/(protected)/admin/people/actions";
import {
  fieldInputStyle,
  fieldLabelStyle,
  formGridStyle,
  formNoteStyle,
} from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";

export function LeaderProfileForm() {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateLeaderProfile,
    { resetOnSuccess: true }
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      style={{ display: "grid", gap: 12 }}
    >
      <p style={formNoteStyle}>
        Creates a leader profile in the directory. Place them in a group and
        track their care from the person&rsquo;s tabs.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="leader-full_name" style={fieldLabelStyle}>
            Full name
          </label>
          <input
            id="leader-full_name"
            name="full_name"
            type="text"
            required
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="Julian Example"
          />
        </div>
        <div>
          <label htmlFor="leader-email" style={fieldLabelStyle}>
            Email
          </label>
          <input
            id="leader-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="julian@example.com"
          />
        </div>
        <div>
          <label htmlFor="leader-phone" style={fieldLabelStyle}>
            Phone (optional)
          </label>
          <input
            id="leader-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="(555) 123-4567"
          />
        </div>
        <div>
          <PButton type="submit" tone="solid" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add leader"}
          </PButton>
        </div>
      </div>
      <FormStatus state={state} successText="Leader profile added." />
    </form>
  );
}
