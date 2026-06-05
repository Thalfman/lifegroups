"use client";

import { PButton } from "@/components/pastoral/button";
import {
  adminWriteCareNote,
  adminWritePrayerRequest,
} from "@/app/(protected)/admin/shepherd-care/care-notes-actions";
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

// Pivot slice 9 (#381 / ADR 0017). Writes one author-private Care Note OR Prayer
// Request about a subject person. Authored by an Over-Shepherd about a Leader
// they cover; the coverage boundary is enforced in the SECURITY DEFINER RPC. The
// body is sealed to the author by default — the oversight ladder reads it only
// when the subject's transparency toggle (the inline control alongside) is on.
export function CareNoteWriteForm({
  subjectProfileId,
  kind,
}: {
  subjectProfileId: string;
  kind: "care_note" | "prayer_request";
}) {
  const action =
    kind === "care_note" ? adminWriteCareNote : adminWritePrayerRequest;
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    action,
    { resetOnSuccess: true }
  );

  const label = kind === "care_note" ? "Care note" : "Prayer request";
  const idPrefix = kind === "care_note" ? "cn" : "pr";
  const placeholder =
    kind === "care_note"
      ? "What's going on with this leader pastorally?"
      : "How can we be praying for this leader?";

  return (
    <form
      ref={formRef}
      action={formAction}
      style={{ display: "grid", gap: 12 }}
    >
      <input type="hidden" name="subject_profile_id" value={subjectProfileId} />
      <p style={formNoteStyle}>
        {label}s are private to you by default. Ministry leadership can only
        read them if this person&apos;s transparency toggle is turned on.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor={`${idPrefix}-body`} style={fieldLabelStyle}>
            {label} (max 4000 chars)
          </label>
          <textarea
            id={`${idPrefix}-body`}
            name="body"
            rows={4}
            required
            maxLength={4000}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 96 }}
            placeholder={placeholder}
          />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <PButton type="submit" tone="terra" size="md" disabled={pending}>
            {pending ? "Saving…" : `Add ${label.toLowerCase()}`}
          </PButton>
        </div>
      </div>
      <FormStatus state={state} successText={`${label} saved.`} />
    </form>
  );
}
