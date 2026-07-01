"use server";

// Subject scoping here is enforced by the RPC + RLS (auth_is_admin), not a
// client-side `guard` — fine while admins are global. If a SCOPED admin (e.g.
// regional) ever lands, add a `guard` to these specs so an out-of-scope target
// is a clean logged denial, not a generic RPC error (ARCH-5). The
// REVALIDATE_PATHS below already cover every surface that renders this queue
// (ARCH-6): the Follow-ups tab, the Care tab's embedded list, Guests, Home,
// and the leader surface.

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
import { toRpcArgs } from "@/lib/shared/rpc-args";

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
      // The Add-Follow-up form no longer offers a "Related guest" link to the
      // retired legacy guests pipeline (#639). The column and RPC arg stay so
      // existing legacy data and the frozen Guests surface are unaffected; new
      // follow-ups simply never set it.
      p_related_guest_id: null,
      ...toRpcArgs(value, CREATE_FOLLOW_UP_KEYS),
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
    adminRpc(
      client,
      "admin_update_follow_up_status",
      toRpcArgs(value, UPDATE_STATUS_KEYS)
    ),
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The status wasn't updated. Please try again.",
};

export async function adminUpdateFollowUpStatus(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<AdminUpdateFollowUpStatusPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_STATUS_SPEC, prev, input);
}
