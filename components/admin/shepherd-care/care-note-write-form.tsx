"use client";

import { PButton } from "@/components/pastoral/button";
import {
  adminWriteCareNote,
  adminWritePrayerRequest,
} from "@/app/(protected)/admin/shepherd-care/care-notes-actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  fieldInputClassName as FIELD_INPUT,
  fieldLabelClassName as FIELD_LABEL,
} from "@/components/admin/forms/field-styles";

// Pivot slice 9 (#381 / ADR 0017, author set widened by ADR 0023). Writes one
// author-private Care Note OR Prayer Request about a subject person. Authored
// by an Over-Shepherd about a Leader they cover, or by a Ministry/Super Admin
// about any active leader; the boundary is enforced in the SECURITY DEFINER
// RPC. The body is sealed to the author by default — the oversight ladder
// reads it only when the subject's transparency toggle (the inline control
// alongside) is on.
export function CareNoteWriteForm({
  subjectProfileId,
  kind,
  subjectName,
}: {
  subjectProfileId: string;
  kind: "care_note" | "prayer_request";
  // When the form repeats across Leaders (the Care accordion, ADR 0023) the
  // submit's accessible name must carry record context — same invariant as
  // every repeated admin control (Admin Interaction Model req 4). Optional so
  // the one-form-per-page detail surface keeps its plain visible label.
  subjectName?: string;
}) {
  const action =
    kind === "care_note" ? adminWriteCareNote : adminWritePrayerRequest;
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    action,
    { resetOnSuccess: true }
  );

  const label = kind === "care_note" ? "Care note" : "Prayer request";
  // Ids include the subject so repeated forms (one per Leader in the
  // accordion) never collide on label/textarea ids.
  const idPrefix = `${kind === "care_note" ? "cn" : "pr"}-${subjectProfileId}`;
  const placeholder =
    kind === "care_note"
      ? "What's going on with this leader pastorally?"
      : "How can we be praying for this leader?";
  const submitLabel = `Add ${label.toLowerCase()}`;

  return (
    <form ref={formRef} action={formAction} className="grid gap-3">
      <input type="hidden" name="subject_profile_id" value={subjectProfileId} />
      <p className="m-0 mb-3 font-sans text-sm leading-normal text-ink2">
        {label}s are private to you by default. Ministry leadership can only
        read them if this person&apos;s transparency toggle is turned on.
      </p>
      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] md:gap-3.5">
        <div className="col-span-full">
          <label htmlFor={`${idPrefix}-body`} className={FIELD_LABEL}>
            {label} (max 4000 chars)
          </label>
          <textarea
            id={`${idPrefix}-body`}
            name="body"
            rows={4}
            required
            maxLength={4000}
            className={`${FIELD_INPUT} min-h-24 resize-y`}
            placeholder={placeholder}
          />
        </div>
        <div className="flex flex-wrap gap-2.5">
          <PButton
            type="submit"
            tone="terra"
            size="md"
            disabled={pending}
            // Starts with the visible label (axe label-in-name) then adds the
            // subject, mirroring NoteTransparencyToggle's contextual pattern.
            aria-label={
              subjectName ? `${submitLabel} for ${subjectName}` : undefined
            }
          >
            {pending ? "Saving…" : submitLabel}
          </PButton>
        </div>
      </div>
      <FormStatus state={state} successText={`${label} saved.`} />
    </form>
  );
}
