"use client";

import { PButton } from "@/components/pastoral/button";
import { adminCreateProspect } from "@/app/(protected)/admin/plan/actions";
import {
  fieldInputStyle,
  fieldLabelStyle,
  formGridStyle,
  formNoteStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";

// Add a Prospect to the funnel (acceptance #2). A new Prospect always lands in
// Interested with no group — the state machine moves them onward from there.
export function ProspectCreateForm() {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateProspect,
    { resetOnSuccess: true }
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      style={{ display: "grid", gap: 12 }}
    >
      <p style={formNoteStyle}>
        Only the name is required. New prospects start as <em>Interested</em>;
        move them to Matched once you have a group.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="prospect-full_name" style={fieldLabelStyle}>
            Full name
          </label>
          <input
            id="prospect-full_name"
            name="full_name"
            type="text"
            required
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="Avery Bennett"
          />
        </div>
        <div>
          <label htmlFor="prospect-email" style={fieldLabelStyle}>
            Email (optional)
          </label>
          <input
            id="prospect-email"
            name="email"
            type="email"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="avery@example.com"
          />
        </div>
        <div>
          <label htmlFor="prospect-phone" style={fieldLabelStyle}>
            Phone (optional)
          </label>
          <input
            id="prospect-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="(555) 555-0100"
          />
        </div>
        <div>
          <PButton type="submit" tone="terra" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add prospect"}
          </PButton>
        </div>
      </div>
      <FormStatus state={state} successText="Prospect added." />
    </form>
  );
}
