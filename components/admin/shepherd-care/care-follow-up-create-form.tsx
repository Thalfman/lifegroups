"use client";

import { useEffect } from "react";
import { NOTE_MAX_CHARS } from "@/lib/shared/limits";
import { adminCreateShepherdCareFollowUp } from "@/app/(protected)/admin/shepherd-care/actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { Button } from "@/components/ui/button";
import {
  fieldInputClassName as FIELD_INPUT,
  fieldLabelClassName as FIELD_LABEL,
  formNoteClassName,
} from "@/components/admin/forms/field-styles";

// Form anatomy comes from the canonical field styles (design direction §4);
// only the lede spacing below it is local.
const FORM_NOTE = `${formNoteClassName} mb-3`;

// Creates a care follow-up against an existing care profile. The care
// profile id and the shepherd profile id are passed as hidden fields — the
// latter only so the action can revalidate this detail page on success.
export function CareFollowUpCreateForm({
  careProfileId,
  shepherdProfileId,
  // Supplied when rendered inside the EditingSurface drawer (#268), mirroring
  // the Follow-up create flow (#267): `onSaved` closes + refreshes once the
  // follow-up is created, `onDirty` lets the drawer warn before discarding
  // entered values, `onCancel` renders a Cancel control beside Add follow-up,
  // and `onPendingChange` lets the drawer block dismissal while the create is
  // in flight.
  onSaved,
  onDirty,
  onCancel,
  onPendingChange,
}: {
  careProfileId: string;
  shepherdProfileId: string;
  onSaved?: () => void;
  onDirty?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateShepherdCareFollowUp,
    { resetOnSuccess: true }
  );

  // useActionForm resets the <form> on success; in the drawer `onSaved` then
  // closes it (the form unmounts, so the reset is moot there but harmless).
  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  // Mirror the in-flight state up so the drawer keeps itself open until the
  // create resolves rather than being dismissed mid-write.
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
      <input type="hidden" name="care_profile_id" value={careProfileId} />
      <input
        type="hidden"
        name="shepherd_profile_id"
        value={shepherdProfileId}
      />
      <p className={FORM_NOTE}>
        Capture the concrete next step you owe this shepherd. Title is required;
        a due date and notes are optional. New follow-ups start as open.
        Admin-only — these never appear on shepherd or member surfaces.
      </p>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] md:gap-3.5">
        <div className="col-span-full">
          <label htmlFor="cfu-title" className={FIELD_LABEL}>
            Title
          </label>
          <input
            id="cfu-title"
            name="title"
            type="text"
            required
            maxLength={200}
            className={FIELD_INPUT}
            placeholder="Check in next week about their discouragement"
          />
        </div>
        <div>
          <label htmlFor="cfu-due_date" className={FIELD_LABEL}>
            Due date (optional)
          </label>
          <input
            id="cfu-due_date"
            name="due_date"
            type="date"
            className={FIELD_INPUT}
          />
        </div>
        <div className="col-span-full">
          <label htmlFor="cfu-notes" className={FIELD_LABEL}>
            Notes (optional, max 2000 chars) — admin-only
          </label>
          <textarea
            id="cfu-notes"
            name="notes"
            rows={3}
            maxLength={NOTE_MAX_CHARS}
            className={`${FIELD_INPUT} min-h-20 resize-y`}
            placeholder="What exactly needs to happen?"
          />
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add follow-up"}
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
      </div>
      <FormStatus state={state} successText="Follow-up added." />
    </form>
  );
}
