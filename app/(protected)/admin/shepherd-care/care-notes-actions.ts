"use server";

import {
  validateSetNoteTransparencyGrantPayload,
  validateWriteCareNotePayload,
  validateWritePrayerRequestPayload,
  type SetNoteTransparencyGrantPayload,
  type WriteCareNotePayload,
  type WritePrayerRequestPayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { requireOverShepherdOrAdminSession } from "@/lib/auth/session";
import {
  rpcAdminWriteCareNote,
  rpcAdminWritePrayerRequest,
  rpcSetNoteTransparencyGrant,
} from "@/lib/admin/rpc";

// Pivot slice 9 (#381 / ADR 0017) server actions: author-private Care Notes +
// Prayer Requests and the per-subject transparency toggle. All three reuse the
// shared write-action runner (no service-role key in the Next runtime).
//
//   * The note + prayer writes are AUTHORED by Over-Shepherds OR admins
//     (ADR 0023 widened the author set), so they use the shared
//     over-shepherd-or-admin gate. The per-subject authorship boundary is
//     enforced inside the SECURITY DEFINER RPC — auth_is_admin() OR
//     auth_over_shepherd_covers(subject) — which also writes the paired audit
//     row and NEVER stores the body in audit metadata.
//   * The transparency toggle is MINISTRY-ADMIN controlled, so it keeps the
//     default requireAdminSession gate (ministry_admin + super_admin); the RPC
//     re-checks auth_is_admin(). Flipping it ON is what lets the oversight ladder
//     peek at that subject's sealed notes.

const WRITE_CARE_NOTE_KEYS = ["subject_profile_id", "body"] as const;
const WRITE_PRAYER_REQUEST_KEYS = ["subject_profile_id", "body"] as const;
const SET_GRANT_KEYS = ["subject_profile_id", "granted"] as const;

// The Care surface revalidates the subject's leader-detail page + the care list
// after any of these writes. The subject id is the leader's profile id, which is
// also the [profileId] route segment.
function careSubjectPaths(subjectProfileId: string): string[] {
  return ["/admin/care", `/admin/shepherd-care/${subjectProfileId}`];
}

// ----- adminWriteCareNote --------------------------------------------------

const WRITE_CARE_NOTE_SPEC: AdminWriteActionSpec<
  WriteCareNotePayload,
  { id: string }
> = {
  name: "admin.care_note.write",
  keys: WRITE_CARE_NOTE_KEYS,
  validate: validateWriteCareNotePayload,
  auth: requireOverShepherdOrAdminSession,
  fields: (_actor, value) => ({
    target_subject_profile_id: value.subject_profile_id,
  }),
  okFields: () => ({ has_body: true }),
  rpc: (client, value) =>
    rpcAdminWriteCareNote(client, {
      p_subject_profile_id: value.subject_profile_id,
      p_body: value.body,
    }),
  revalidate: (value) => careSubjectPaths(value.subject_profile_id),
  noDataError: "The care note wasn't saved. Please try again.",
};

export async function adminWriteCareNote(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<WriteCareNotePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(WRITE_CARE_NOTE_SPEC, prev, input);
}

// ----- adminWritePrayerRequest ---------------------------------------------

const WRITE_PRAYER_REQUEST_SPEC: AdminWriteActionSpec<
  WritePrayerRequestPayload,
  { id: string }
> = {
  name: "admin.prayer_request.write",
  keys: WRITE_PRAYER_REQUEST_KEYS,
  validate: validateWritePrayerRequestPayload,
  auth: requireOverShepherdOrAdminSession,
  fields: (_actor, value) => ({
    target_subject_profile_id: value.subject_profile_id,
  }),
  okFields: () => ({ has_body: true }),
  rpc: (client, value) =>
    rpcAdminWritePrayerRequest(client, {
      p_subject_profile_id: value.subject_profile_id,
      p_body: value.body,
    }),
  revalidate: (value) => careSubjectPaths(value.subject_profile_id),
  noDataError: "The prayer request wasn't saved. Please try again.",
};

export async function adminWritePrayerRequest(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<WritePrayerRequestPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(WRITE_PRAYER_REQUEST_SPEC, prev, input);
}

// ----- setNoteTransparencyGrant (Ministry-Admin controlled) ----------------

const SET_GRANT_SPEC: AdminWriteActionSpec<
  SetNoteTransparencyGrantPayload,
  { id: string }
> = {
  name: "admin.note_transparency_grant.set",
  keys: SET_GRANT_KEYS,
  validate: validateSetNoteTransparencyGrantPayload,
  // Default auth gate (requireAdminSession): the toggle is Ministry-Admin owned.
  fields: (_actor, value) => ({
    target_subject_profile_id: value.subject_profile_id,
  }),
  okFields: (value) => ({ granted: value.granted }),
  rpc: (client, value) =>
    rpcSetNoteTransparencyGrant(client, {
      p_subject_profile_id: value.subject_profile_id,
      p_granted: value.granted,
    }),
  revalidate: (value) => careSubjectPaths(value.subject_profile_id),
  noDataError: "The transparency toggle wasn't saved. Please try again.",
};

export async function setNoteTransparencyGrant(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<SetNoteTransparencyGrantPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_GRANT_SPEC, prev, input);
}
