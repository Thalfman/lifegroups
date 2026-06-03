"use client";

import { useEffect } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminCreateShepherdCareFollowUp } from "@/app/(protected)/admin/shepherd-care/actions";
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
      style={{ display: "grid", gap: 12 }}
    >
      <input type="hidden" name="care_profile_id" value={careProfileId} />
      <input
        type="hidden"
        name="shepherd_profile_id"
        value={shepherdProfileId}
      />
      <p style={formNoteStyle}>
        Capture the concrete next step you owe this leader. Title is required; a
        due date and notes are optional. New follow-ups start as open.
        Admin-only — these never appear on leader or member surfaces.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="cfu-title" style={fieldLabelStyle}>
            Title
          </label>
          <input
            id="cfu-title"
            name="title"
            type="text"
            required
            maxLength={200}
            style={fieldInputStyle}
            placeholder="Check in next week about their discouragement"
          />
        </div>
        <div>
          <label htmlFor="cfu-due_date" style={fieldLabelStyle}>
            Due date (optional)
          </label>
          <input
            id="cfu-due_date"
            name="due_date"
            type="date"
            style={fieldInputStyle}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="cfu-notes" style={fieldLabelStyle}>
            Notes (optional, max 2000 chars) — admin-only
          </label>
          <textarea
            id="cfu-notes"
            name="notes"
            rows={3}
            maxLength={2000}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 80 }}
            placeholder="What exactly needs to happen?"
          />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <PButton type="submit" tone="terra" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add follow-up"}
          </PButton>
          {onCancel ? (
            <PButton
              type="button"
              tone="ghost"
              size="md"
              disabled={pending}
              onClick={onCancel}
            >
              Cancel
            </PButton>
          ) : null}
        </div>
      </div>
      <FormStatus state={state} successText="Follow-up added." />
    </form>
  );
}
