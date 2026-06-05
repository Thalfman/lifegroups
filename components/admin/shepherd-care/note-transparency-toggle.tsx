"use client";

import { PButton } from "@/components/pastoral/button";
import { setNoteTransparencyGrant } from "@/app/(protected)/admin/shepherd-care/care-notes-actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { P, fontBody } from "@/lib/pastoral";

// Pivot slice 9 (#381 / ADR 0017). The INLINE per-person transparency toggle —
// lives on each Over-Shepherd / Leader in Care, not in Settings. Ministry-Admin
// controlled. ON lets the oversight ladder (Ministry Admin + Super Admin,
// identically) peek at that person's otherwise-sealed Care Notes + Prayer
// Requests; OFF (the default) seals them. The actual gate is RLS + the resolver
// (lib/admin/care-note-visibility.ts); this control just sets the grant.
export function NoteTransparencyToggle({
  subjectProfileId,
  granted,
}: {
  subjectProfileId: string;
  granted: boolean;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    setNoteTransparencyGrant
  );

  // Submitting flips to the opposite of the current state.
  const next = !granted;

  return (
    <form
      action={formAction}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <input type="hidden" name="subject_profile_id" value={subjectProfileId} />
      <input type="hidden" name="granted" value={next ? "true" : "false"} />
      <span
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: granted ? P.terra : P.ink3,
          fontWeight: 600,
        }}
      >
        Leadership visibility: {granted ? "On" : "Sealed"}
      </span>
      <PButton
        type="submit"
        tone={granted ? "ghost" : "terra"}
        size="sm"
        disabled={pending}
      >
        {pending
          ? "Saving…"
          : granted
            ? "Turn off (seal)"
            : "Turn on (let leadership read)"}
      </PButton>
      <FormStatus
        state={state}
        successText={next ? "Leadership can now read." : "Sealed."}
      />
    </form>
  );
}
