"use client";

import {
  leaderWriteGroupCareNote,
  leaderWriteGroupPrayerRequest,
} from "@/app/(protected)/leader/[groupId]/care/actions";
import { NoteWriteForm } from "@/components/notes/note-write-form";

// Pivot slice 11 (#382 / ADR 0020). Writes one author-private Care Note OR
// Prayer Request about the leader's GROUP. The author is the signed-in leader;
// the leader-of-group boundary is enforced in the SECURITY DEFINER RPC. The body
// is sealed to the leader by default — ministry leadership reads it only when
// that leader's transparency toggle (set by an admin in the Care surface) is on.
//
// A thin config of the shared NoteWriteForm (ADR 0036): this file owns only
// the action pair, the Shepherd tier's copy, and the id scheme.
export function GroupNoteWriteForm({
  groupId,
  kind,
}: {
  groupId: string;
  kind: "care_note" | "prayer_request";
}) {
  const label = kind === "care_note" ? "Care note" : "Prayer request";
  return (
    <NoteWriteForm
      action={
        kind === "care_note"
          ? leaderWriteGroupCareNote
          : leaderWriteGroupPrayerRequest
      }
      label={label}
      idPrefix={kind === "care_note" ? "gcn" : "gpr"}
      placeholder={
        kind === "care_note"
          ? "What's going on with your group pastorally?"
          : "How can we be praying for your group?"
      }
      privacyNote={
        <>
          {label}s are private to you. The only way ministry leadership can read
          them is if an admin turns on transparency for you &mdash; that&apos;s
          their call, not something you set here.
        </>
      }
      hiddenFields={{ group_id: groupId }}
    />
  );
}
