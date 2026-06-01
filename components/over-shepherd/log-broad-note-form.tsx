"use client";

import { PButton } from "@/components/pastoral/button";
import { overShepherdLogBroadNote } from "@/app/(protected)/over-shepherd/[profileId]/actions";
import {
  fieldInputStyle,
  fieldLabelStyle,
  formNoteStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";

// The over-shepherd write surface is deliberately one field: a broad note.
// No care-status, touchpoint, interaction-type, admin-summary, or private-note
// control is exposed here (docs/adr/0002, #126). The server action's RPC scopes
// the write to the over-shepherd's coverage and writes the paired audit row.
export function LogBroadNoteForm({
  shepherdProfileId,
}: {
  shepherdProfileId: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    overShepherdLogBroadNote
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: 10 }}>
      <input
        type="hidden"
        name="shepherd_profile_id"
        value={shepherdProfileId}
      />
      <div>
        <label htmlFor="osbn-note" style={fieldLabelStyle}>
          Add a broad note
        </label>
        <textarea
          id="osbn-note"
          name="note"
          rows={3}
          maxLength={2000}
          required
          style={{ ...fieldInputStyle, resize: "vertical", minHeight: 80 }}
          placeholder="A broad, shareable note on how this Leader is doing."
        />
        <p style={formNoteStyle}>
          Broad notes are visible to ministry admins. Keep anything private out
          of this field.
        </p>
      </div>
      <div>
        <PButton type="submit" tone="solid" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save note"}
        </PButton>
      </div>
      <FormStatus state={state} successText="Note saved." />
    </form>
  );
}
