"use client";

import { NOTE_MAX_CHARS } from "@/lib/shared/limits";
import { overShepherdLogBroadNote } from "@/app/(protected)/over-shepherd/[profileId]/actions";
import {
  fieldInputClassName,
  fieldLabelClassName,
  formNoteClassName,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// The over-shepherd write surface is deliberately one field: a broad note.
// No care-status, touchpoint, interaction-type, admin-summary, or private-note
// control is exposed here (docs/adr/0002, #126). The server action's RPC scopes
// the write to the over-shepherd's coverage and writes the paired audit row.
//
// Deliberately NOT a config of the shared NoteWriteForm (ADR 0036): a broad
// note is a different entity with a different field contract — field name
// `note`, its own NOTE_MAX_CHARS cap, no care/prayer kind, no reset-on-success
// — so folding it in would cost the kit more config axes than this one form
// saves.
export function LogBroadNoteForm({
  shepherdProfileId,
}: {
  shepherdProfileId: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    overShepherdLogBroadNote
  );

  return (
    <form action={formAction} className="grid gap-2.5">
      <input
        type="hidden"
        name="shepherd_profile_id"
        value={shepherdProfileId}
      />
      <div>
        <label htmlFor="osbn-note" className={fieldLabelClassName}>
          Add a broad note
        </label>
        <textarea
          id="osbn-note"
          name="note"
          rows={3}
          maxLength={NOTE_MAX_CHARS}
          required
          className={cn(fieldInputClassName, "min-h-20 resize-y")}
          placeholder="A broad, shareable note on how this Shepherd is doing."
        />
        <p className={cn(formNoteClassName, "mt-1.5")}>
          Broad notes are visible to ministry admins. Keep anything private out
          of this field.
        </p>
      </div>
      <div>
        <Button type="submit" variant="solid" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save note"}
        </Button>
      </div>
      <FormStatus state={state} successText="Note saved." />
    </form>
  );
}
