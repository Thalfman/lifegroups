"use client";

import { NOTE_MAX_CHARS } from "@/lib/shared/limits";
import { adminCreateOverShepherd } from "@/app/(protected)/admin/shepherd-care/actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { Button } from "@/components/ui/button";
import {
  fieldInputClassName as FIELD_INPUT,
  fieldLabelClassName as FIELD_LABEL,
} from "@/components/admin/forms/field-styles";

export function OverShepherdCreateForm() {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateOverShepherd,
    { resetOnSuccess: true }
  );

  return (
    <form ref={formRef} action={formAction} className="grid gap-3">
      <p className="m-0 mb-3 font-sans text-sm leading-normal text-ink2">
        Add an over-shepherd to the coverage roster. The email you enter is how
        their login links to this record once they&rsquo;re invited, so they see
        only the leaders they cover. Notes are admin-only and never appear in
        audit summaries.
      </p>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] md:gap-3.5">
        <div>
          <label htmlFor="os-create-full_name" className={FIELD_LABEL}>
            Full name
          </label>
          <input
            id="os-create-full_name"
            name="full_name"
            type="text"
            required
            maxLength={200}
            className={FIELD_INPUT}
          />
        </div>
        <div>
          <label htmlFor="os-create-email" className={FIELD_LABEL}>
            Email (optional)
          </label>
          <input
            id="os-create-email"
            name="email"
            type="email"
            className={FIELD_INPUT}
          />
        </div>
        <div>
          <label htmlFor="os-create-phone" className={FIELD_LABEL}>
            Phone (optional)
          </label>
          <input
            id="os-create-phone"
            name="phone"
            type="tel"
            className={FIELD_INPUT}
          />
        </div>
        <div className="col-span-full">
          <label htmlFor="os-create-notes" className={FIELD_LABEL}>
            Notes (optional, max 2000 chars, admin-only)
          </label>
          <textarea
            id="os-create-notes"
            name="notes"
            rows={3}
            maxLength={NOTE_MAX_CHARS}
            className={`${FIELD_INPUT} min-h-20 resize-y`}
            placeholder="Anything worth remembering about this over-shepherd."
          />
        </div>
        <div>
          <Button type="submit" variant="solid" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add over-shepherd"}
          </Button>
        </div>
      </div>
      <FormStatus state={state} successText="Over-shepherd added." />
    </form>
  );
}
