"use server";

// Canonical home — do NOT retire or warn-log on invoke (ADR 0033). Although this
// file lives in the pre-pivot-named /admin/shepherd-care folder, these actions
// are imported by the canonical Care surface (components/admin/shepherd-care/*),
// so any deprecation here would fire on canonical use.

// Phase SC.1B — care follow-up (task list) actions.

import {
  validateArchiveShepherdCareFollowUpPayload,
  validateCreateShepherdCareFollowUpPayload,
  validateUpdateShepherdCareFollowUpPayload,
  validateUpdateShepherdCareFollowUpStatusPayload,
  type ArchiveShepherdCareFollowUpPayload,
  type CreateShepherdCareFollowUpPayload,
  type UpdateShepherdCareFollowUpPayload,
  type UpdateShepherdCareFollowUpStatusPayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";
import { toRpcArgs } from "@/lib/shared/rpc-args";

// Care follow-up forms attach shepherd_profile_id alongside the care/
// follow-up id purely so the action can revalidate the right detail page on
// success. It is intentionally NOT passed to the RPC (which keys on
// care_profile_id / follow_up_id) — specs whose form carries the extra
// revalidation-only field declare a dedicated *_ARG_KEYS const.
const CREATE_CARE_FOLLOW_UP_KEYS = [
  "care_profile_id",
  "title",
  "due_date",
  "notes",
  "shepherd_profile_id",
] as const;

const CREATE_CARE_FOLLOW_UP_ARG_KEYS = [
  "care_profile_id",
  "title",
  "due_date",
  "notes",
] as const;

const UPDATE_CARE_FOLLOW_UP_STATUS_KEYS = [
  "follow_up_id",
  "status",
  "shepherd_profile_id",
] as const;

// Archive (soft-delete) a care follow-up. shepherd_profile_id is form-only, for
// revalidation; the RPC keys on follow_up_id.
const ARCHIVE_CARE_FOLLOW_UP_KEYS = [
  "follow_up_id",
  "shepherd_profile_id",
] as const;

const UPDATE_CARE_FOLLOW_UP_KEYS = [
  "follow_up_id",
  "title",
  "set_due_date",
  "due_date",
  "set_notes",
  "notes",
  "shepherd_profile_id",
] as const;

const UPDATE_CARE_FOLLOW_UP_ARG_KEYS = [
  "follow_up_id",
  "title",
  "set_due_date",
  "due_date",
  "set_notes",
  "notes",
] as const;

// Kept file-local (duplicated across the shepherd-care `*-actions.ts`
// siblings, like care-notes-actions.ts's careSubjectPaths): the
// revalidate-path fitness extractor resolves same-file declarations only.
function shepherdCarePaths(shepherdProfileId?: string): string[] {
  return [
    "/admin/shepherd-care",
    ...(shepherdProfileId ? [`/admin/shepherd-care/${shepherdProfileId}`] : []),
  ];
}

// Pulls the optional shepherd_profile_id off the raw form so the care-detail
// page revalidates after a follow-up write. The RPC never sees it.
function revalidateShepherdFromRaw(raw: Record<string, unknown>): string[] {
  const shepherdProfileId =
    typeof raw.shepherd_profile_id === "string"
      ? raw.shepherd_profile_id
      : undefined;
  return shepherdCarePaths(shepherdProfileId);
}

// ----- adminCreateShepherdCareFollowUp ------------------------------------

const CREATE_CARE_FOLLOW_UP_SPEC: AdminWriteActionSpec<
  CreateShepherdCareFollowUpPayload,
  { id: string }
> = {
  name: "admin.shepherd_care.create_follow_up",
  keys: CREATE_CARE_FOLLOW_UP_KEYS,
  validate: validateCreateShepherdCareFollowUpPayload,
  fields: (_actor, value) => ({
    target_care_profile_id: value.care_profile_id,
  }),
  okFields: (value) => ({
    has_due_date: value.due_date !== null,
    has_notes: value.notes !== null,
  }),
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_create_shepherd_care_follow_up",
      toRpcArgs(value, CREATE_CARE_FOLLOW_UP_ARG_KEYS)
    ),
  revalidate: (_value, raw) => revalidateShepherdFromRaw(raw),
  noDataError: "The follow-up wasn't saved. Please try again.",
};

export async function adminCreateShepherdCareFollowUp(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<CreateShepherdCareFollowUpPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_CARE_FOLLOW_UP_SPEC, prev, input);
}

// ----- adminUpdateShepherdCareFollowUpStatus ------------------------------

const UPDATE_CARE_FOLLOW_UP_STATUS_SPEC: AdminWriteActionSpec<
  UpdateShepherdCareFollowUpStatusPayload,
  { id: string }
> = {
  name: "admin.shepherd_care.update_follow_up_status",
  keys: UPDATE_CARE_FOLLOW_UP_STATUS_KEYS,
  validate: validateUpdateShepherdCareFollowUpStatusPayload,
  fields: (_actor, value) => ({ target_follow_up_id: value.follow_up_id }),
  okFields: (value) => ({ status: value.status }),
  rpc: (client, value) =>
    adminRpc(client, "admin_update_shepherd_care_follow_up_status", {
      p_follow_up_id: value.follow_up_id,
      p_new_status: value.status,
    }),
  revalidate: (_value, raw) => revalidateShepherdFromRaw(raw),
  noDataError: "The follow-up wasn't updated. Please try again.",
};

export async function adminUpdateShepherdCareFollowUpStatus(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpdateShepherdCareFollowUpStatusPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_CARE_FOLLOW_UP_STATUS_SPEC, prev, input);
}

// ----- adminArchiveShepherdCareFollowUp -----------------------------------

const ARCHIVE_CARE_FOLLOW_UP_SPEC: AdminWriteActionSpec<
  ArchiveShepherdCareFollowUpPayload,
  { id: string }
> = {
  name: "admin.shepherd_care.archive_follow_up",
  keys: ARCHIVE_CARE_FOLLOW_UP_KEYS,
  validate: validateArchiveShepherdCareFollowUpPayload,
  fields: (_actor, value) => ({ target_follow_up_id: value.follow_up_id }),
  rpc: (client, value) =>
    adminRpc(client, "admin_archive_shepherd_care_follow_up", {
      p_follow_up_id: value.follow_up_id,
    }),
  revalidate: (_value, raw) => revalidateShepherdFromRaw(raw),
  noDataError: "The follow-up wasn't archived. Please try again.",
};

export async function adminArchiveShepherdCareFollowUp(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<ArchiveShepherdCareFollowUpPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ARCHIVE_CARE_FOLLOW_UP_SPEC, prev, input);
}

// ----- adminUpdateShepherdCareFollowUp ------------------------------------

const UPDATE_CARE_FOLLOW_UP_SPEC: AdminWriteActionSpec<
  UpdateShepherdCareFollowUpPayload,
  { id: string }
> = {
  name: "admin.shepherd_care.update_follow_up",
  keys: UPDATE_CARE_FOLLOW_UP_KEYS,
  validate: validateUpdateShepherdCareFollowUpPayload,
  fields: (_actor, value) => ({ target_follow_up_id: value.follow_up_id }),
  okFields: (value) => ({
    due_date_set: value.set_due_date,
    notes_set: value.set_notes,
  }),
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_update_shepherd_care_follow_up",
      toRpcArgs(value, UPDATE_CARE_FOLLOW_UP_ARG_KEYS)
    ),
  revalidate: (_value, raw) => revalidateShepherdFromRaw(raw),
  noDataError: "The follow-up wasn't updated. Please try again.",
};

export async function adminUpdateShepherdCareFollowUp(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpdateShepherdCareFollowUpPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_CARE_FOLLOW_UP_SPEC, prev, input);
}
