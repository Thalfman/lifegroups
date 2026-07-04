"use client";

import { Button } from "@/components/ui/button";
import { setNoteTransparencyGrant } from "@/app/(protected)/admin/shepherd-care/care-notes-actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { cn } from "@/lib/utils";

// Pivot slice 9 (#381 / ADR 0017). The INLINE per-person transparency toggle —
// lives on each Over-Shepherd / Leader in Care, not in Settings. Ministry-Admin
// controlled. ON lets the oversight ladder (Ministry Admin + Super Admin,
// identically) peek at that person's otherwise-sealed Care Notes + Prayer
// Requests; OFF (the default) seals them. The actual gate is RLS + the resolver
// (lib/admin/care-note-visibility.ts); this control just sets the grant.
export function NoteTransparencyToggle({
  subjectProfileId,
  granted,
  subjectName,
}: {
  subjectProfileId: string;
  granted: boolean;
  // When the toggle repeats across Leaders (the Care accordion, #467) the
  // button's accessible name must carry record context — same invariant as
  // every repeated admin control (Admin Interaction Model req 4). Optional so
  // the single-toggle per-leader detail page keeps its plain visible label.
  subjectName?: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    setNoteTransparencyGrant
  );

  // Submitting flips to the opposite of the current state.
  const next = !granted;
  const buttonLabel = granted
    ? "Turn off (seal)"
    : "Turn on (let leadership read)";

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2.5">
      <input type="hidden" name="subject_profile_id" value={subjectProfileId} />
      <input type="hidden" name="granted" value={next ? "true" : "false"} />
      <span
        className={cn(
          "font-sans text-sm font-semibold",
          granted ? "text-clayDeep" : "text-ink3"
        )}
      >
        Leadership visibility: {granted ? "On" : "Sealed"}
      </span>
      <Button
        type="submit"
        variant={granted ? "ghost" : "primary"}
        size="sm"
        disabled={pending}
        // Starts with the visible label (axe label-in-name) then adds the
        // leader, mirroring FollowUpStatusControls' contextual-name pattern.
        aria-label={
          subjectName ? `${buttonLabel} for ${subjectName}` : undefined
        }
      >
        {pending ? "Saving…" : buttonLabel}
      </Button>
      <FormStatus
        state={state}
        successText={next ? "Leadership can now read." : "Sealed."}
      />
    </form>
  );
}
