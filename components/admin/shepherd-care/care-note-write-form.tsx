"use client";

import {
  adminWriteCareNote,
  adminWritePrayerRequest,
} from "@/app/(protected)/admin/shepherd-care/care-notes-actions";
import { NoteWriteForm } from "@/components/notes/note-write-form";

// Pivot slice 9 (#381 / ADR 0017, author set widened by ADR 0023). Writes one
// author-private Care Note OR Prayer Request about a subject person. Authored
// by an Over-Shepherd about a Leader they cover, or by a Ministry/Super Admin
// about any active leader; the boundary is enforced in the SECURITY DEFINER
// RPC. The body is sealed to the author by default — the oversight ladder
// reads it only when the subject's transparency toggle (the inline control
// alongside) is on.
//
// A thin config of the shared NoteWriteForm (ADR 0036): this file owns only
// the action pair, the tier's copy, and the id scheme.
export function CareNoteWriteForm({
  subjectProfileId,
  kind,
  subjectName,
  idNamespace,
  onSaved,
  onDirty,
  onCancel,
  onPendingChange,
}: {
  subjectProfileId: string;
  kind: "care_note" | "prayer_request";
  // When the form repeats across Leaders (the Care accordion, ADR 0023) the
  // submit's accessible name must carry record context — same invariant as
  // every repeated admin control (Admin Interaction Model req 4). Optional so
  // the one-form-per-page detail surface keeps its plain visible label.
  subjectName?: string;
  // An extra id-uniqueness token (#776 Phase 1 / #785). The accordion's inline
  // forms and a contextual-drawer instance can be mounted for the SAME leader at
  // once (the Care shell keeps all tab panels mounted), so a drawer body passes
  // a distinct namespace to keep textarea/label ids unique — otherwise a label's
  // htmlFor could resolve to the hidden background textarea. Inline callers omit
  // it, keeping their ids byte-stable.
  idNamespace?: string;
  // Optional drawer wiring (#776 Phase 1): supplied only when this form is a
  // contextual drawer body, mirroring the care-action forms (#268). `onSaved`
  // closes + refreshes, `onDirty` lets the drawer warn before discarding,
  // `onPendingChange` blocks dismissal mid-write, and `onCancel` renders a
  // Cancel control. The inline accordion/feed usages pass none → unchanged.
  onSaved?: () => void;
  onDirty?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const label = kind === "care_note" ? "Care note" : "Prayer request";
  // Ids include the subject (and an optional namespace) so repeated forms — one
  // per Leader in the accordion, plus a possible contextual-drawer instance for
  // the same leader — never collide on label/textarea ids.
  const idPrefix = `${kind === "care_note" ? "cn" : "pr"}-${subjectProfileId}${
    idNamespace ? `-${idNamespace}` : ""
  }`;
  return (
    <NoteWriteForm
      action={
        kind === "care_note" ? adminWriteCareNote : adminWritePrayerRequest
      }
      label={label}
      idPrefix={idPrefix}
      placeholder={
        kind === "care_note"
          ? "What's going on with this shepherd pastorally?"
          : "How can we be praying for this shepherd?"
      }
      privacyNote={
        <>
          {label}s are private to you by default. Ministry leadership can only
          read them if this person&apos;s transparency toggle is turned on.
        </>
      }
      hiddenFields={{ subject_profile_id: subjectProfileId }}
      submitContextName={subjectName}
      onSaved={onSaved}
      onDirty={onDirty}
      onCancel={onCancel}
      onPendingChange={onPendingChange}
    />
  );
}
