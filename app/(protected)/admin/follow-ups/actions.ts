"use server";

import {
  validateAdminUpdateFollowUpStatusPayload,
  validateCreateFollowUpPayload,
  type AdminUpdateFollowUpStatusPayload,
  type CreateFollowUpPayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";

const REVALIDATE_PATHS = [
  "/admin/follow-ups",
  // Canonical Care surface renders this same generic follow-up queue (via
  // AdminFollowUpsShell in /admin/care/page.tsx). It's a sidebar-prefetched,
  // router-cached path, so a status edit made elsewhere must bust it too or
  // the Care tab's Follow-ups list shows the old status until the cache window.
  "/admin/care",
  "/admin/guests",
  "/admin",
  "/leader",
] as const;

const CREATE_FOLLOW_UP_KEYS = [
  "type",
  "title",
  "related_group_id",
  "related_member_id",
  "related_guest_id",
  "assigned_to",
  "priority",
  "due_date",
  "leader_visible_note",
  "admin_private_note",
] as const;

const UPDATE_STATUS_KEYS = [
  "follow_up_id",
  "status",
  "set_leader_visible_note",
  "leader_visible_note",
  "set_admin_private_note",
  "admin_private_note",
] as const;

// ----- adminCreateFollowUp -----------------------------------------------

const CREATE_FOLLOW_UP_SPEC: AdminWriteActionSpec<
  CreateFollowUpPayload,
  { id: string }
> = {
  name: "admin.follow_ups.create",
  keys: CREATE_FOLLOW_UP_KEYS,
  validate: validateCreateFollowUpPayload,
  okFields: (value, id) => ({
    new_follow_up_id: id,
    follow_up_type: value.type,
    priority: value.priority,
  }),
  rpc: (client, value) =>
    adminRpc(client, "admin_create_follow_up", {
      p_type: value.type,
      p_title: value.title,
      p_related_group_id: value.related_group_id,
      p_related_member_id: value.related_member_id,
      p_related_guest_id: value.related_guest_id,
      p_assigned_to: value.assigned_to,
      p_priority: value.priority,
      p_due_date: value.due_date,
      p_leader_visible_note: value.leader_visible_note,
      p_admin_private_note: value.admin_private_note,
    }),
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The follow-up wasn't saved. Please try again.",
};

export async function adminCreateFollowUp(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<CreateFollowUpPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_FOLLOW_UP_SPEC, prev, input);
}

// ----- adminUpdateFollowUpStatus ------------------------------------------

const UPDATE_STATUS_SPEC: AdminWriteActionSpec<
  AdminUpdateFollowUpStatusPayload,
  { id: string }
> = {
  name: "admin.follow_ups.update_status",
  keys: UPDATE_STATUS_KEYS,
  validate: validateAdminUpdateFollowUpStatusPayload,
  fields: (_actor, value) => ({ target_follow_up_id: value.follow_up_id }),
  okFields: (value) => ({ new_status: value.status }),
  rpc: (client, value) =>
    adminRpc(client, "admin_update_follow_up_status", {
      p_follow_up_id: value.follow_up_id,
      p_status: value.status,
      p_set_leader_visible_note: value.set_leader_visible_note,
      p_leader_visible_note: value.leader_visible_note,
      p_set_admin_private_note: value.set_admin_private_note,
      p_admin_private_note: value.admin_private_note,
    }),
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The status wasn't updated. Please try again.",
};

export async function adminUpdateFollowUpStatus(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<AdminUpdateFollowUpStatusPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_STATUS_SPEC, prev, input);
}
