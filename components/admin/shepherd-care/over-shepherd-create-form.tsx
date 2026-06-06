"use client";

import { PButton } from "@/components/pastoral/button";
import { adminCreateOverShepherd } from "@/app/(protected)/admin/shepherd-care/actions";
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

export function OverShepherdCreateForm() {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateOverShepherd,
    { resetOnSuccess: true }
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      style={{ display: "grid", gap: 12 }}
    >
      <p style={formNoteStyle}>
        Add an over-shepherd to the coverage roster. The email you enter is how
        their login links to this record once they&rsquo;re invited, so they see
        only the leaders they cover. Notes are admin-only and never appear in
        audit summaries.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="os-create-full_name" style={fieldLabelStyle}>
            Full name
          </label>
          <input
            id="os-create-full_name"
            name="full_name"
            type="text"
            required
            maxLength={200}
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="os-create-email" style={fieldLabelStyle}>
            Email (optional)
          </label>
          <input
            id="os-create-email"
            name="email"
            type="email"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="os-create-phone" style={fieldLabelStyle}>
            Phone (optional)
          </label>
          <input
            id="os-create-phone"
            name="phone"
            type="tel"
            style={fieldInputStyle}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="os-create-notes" style={fieldLabelStyle}>
            Notes (optional, max 2000 chars) — admin-only
          </label>
          <textarea
            id="os-create-notes"
            name="notes"
            rows={3}
            maxLength={2000}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 80 }}
            placeholder="Anything worth remembering about this over-shepherd."
          />
        </div>
        <div>
          <PButton type="submit" tone="solid" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add over-shepherd"}
          </PButton>
        </div>
      </div>
      <FormStatus state={state} successText="Over-shepherd added." />
    </form>
  );
}
