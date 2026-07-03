"use client";

import { PButton } from "@/components/pastoral/button";
import { NOTE_MAX_CHARS } from "@/lib/shared/limits";
import { adminUpdateOverShepherd } from "@/app/(protected)/admin/shepherd-care/actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  fieldInputClassName as FIELD_INPUT,
  fieldLabelClassName as FIELD_LABEL,
} from "@/components/admin/forms/field-styles";
import type { OverShepherdsRow } from "@/types/database";

export function OverShepherdEditForm({
  overShepherd,
}: {
  overShepherd: OverShepherdsRow;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateOverShepherd
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="over_shepherd_id" value={overShepherd.id} />
      <p className="m-0 mb-3 font-sans text-sm leading-normal text-ink2">
        Update the over-shepherd record. Deactivating archives them softly —
        they remain in the audit trail and historic coverage assignments.
        Reactivate any time.
      </p>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] md:gap-3.5">
        <div>
          <label htmlFor="os-edit-full_name" className={FIELD_LABEL}>
            Full name
          </label>
          <input
            id="os-edit-full_name"
            name="full_name"
            type="text"
            required
            maxLength={200}
            defaultValue={overShepherd.full_name}
            className={FIELD_INPUT}
          />
        </div>
        <div>
          <label htmlFor="os-edit-email" className={FIELD_LABEL}>
            Email (optional)
          </label>
          <input
            id="os-edit-email"
            name="email"
            type="email"
            defaultValue={overShepherd.email ?? ""}
            className={FIELD_INPUT}
          />
        </div>
        <div>
          <label htmlFor="os-edit-phone" className={FIELD_LABEL}>
            Phone (optional)
          </label>
          <input
            id="os-edit-phone"
            name="phone"
            type="tel"
            defaultValue={overShepherd.phone ?? ""}
            className={FIELD_INPUT}
          />
        </div>
        <div className="col-span-full">
          <label htmlFor="os-edit-notes" className={FIELD_LABEL}>
            Notes (optional, max 2000 chars) — admin-only
          </label>
          <textarea
            id="os-edit-notes"
            name="notes"
            rows={3}
            maxLength={NOTE_MAX_CHARS}
            defaultValue={overShepherd.notes ?? ""}
            className={`${FIELD_INPUT} min-h-20 resize-y`}
          />
        </div>
        <div className="col-span-full">
          <label className="inline-flex items-center gap-2 font-sans text-sm text-ink2">
            <input
              type="checkbox"
              name="active"
              value="true"
              defaultChecked={overShepherd.active}
            />
            Active (uncheck to soft-archive)
          </label>
        </div>
        <div>
          <PButton type="submit" tone="solid" size="md" disabled={pending}>
            {pending ? "Saving…" : "Save over-shepherd"}
          </PButton>
        </div>
      </div>
      <FormStatus state={state} successText="Over-shepherd saved." />
    </form>
  );
}
