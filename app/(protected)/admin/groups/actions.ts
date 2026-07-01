"use server";

import {
  validateCreateGroupPayload,
  validateUpdateGroupPayload,
  validateGroupIdPayload,
  type GroupWritablePayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";
import { toRpcArgs } from "@/lib/shared/rpc-args";

const REVALIDATE_PATH = "/admin/groups";

// Lifecycle (close/reopen) can be driven from the group DETAIL header (#776
// OPP-2), not just the list, so revalidate the specific detail route too —
// otherwise restoring/archiving from the detail page leaves it stale until a
// manual refresh (the list-only revalidate never touches `/admin/groups/[id]`).
function groupLifecyclePaths(groupId: string): string[] {
  return [REVALIDATE_PATH, `/admin/groups/${groupId}`];
}

// Doubles as the toRpcArgs key list: the RPC args are exactly these fields,
// p_-prefixed (checked against GroupRpcArgs at the adminRpc call sites).
const GROUP_KEYS = [
  "name",
  "description",
  "meeting_day",
  "meeting_time",
  "meeting_frequency",
  "meeting_week_parity",
  "location_area",
  "address_optional",
  "capacity",
  "group_type",
  "launched_on",
] as const;

// ----- adminCreateGroup ----------------------------------------------------

const CREATE_GROUP_SPEC: AdminWriteActionSpec<
  GroupWritablePayload,
  { id: string }
> = {
  name: "admin.groups.create",
  keys: GROUP_KEYS,
  validate: validateCreateGroupPayload,
  okFields: (_value, id) => ({ new_group_id: id }),
  rpc: (client, value) =>
    adminRpc(client, "admin_create_group", toRpcArgs(value, GROUP_KEYS)),
  revalidate: () => REVALIDATE_PATH,
  noDataError: "The group was not created. Please try again.",
};

export async function adminCreateGroup(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<GroupWritablePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_GROUP_SPEC, prev, input);
}

// ----- adminUpdateGroup ----------------------------------------------------

type UpdateGroupPayload = GroupWritablePayload & { group_id: string };

const UPDATE_GROUP_KEYS = ["group_id", ...GROUP_KEYS] as const;

const UPDATE_GROUP_SPEC: AdminWriteActionSpec<
  UpdateGroupPayload,
  { id: string }
> = {
  name: "admin.groups.update",
  keys: UPDATE_GROUP_KEYS,
  validate: validateUpdateGroupPayload,
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  rpc: (client, value) =>
    adminRpc(client, "admin_update_group", {
      p_group_id: value.group_id,
      ...toRpcArgs(value, GROUP_KEYS),
    }),
  revalidate: () => REVALIDATE_PATH,
  noDataError: "The group was not updated. Please try again.",
};

export async function adminUpdateGroup(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpdateGroupPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_GROUP_SPEC, prev, input);
}

// ----- adminCloseGroup -----------------------------------------------------

type GroupIdPayload = { group_id: string };

const GROUP_ID_KEYS = ["group_id"] as const;

const CLOSE_GROUP_SPEC: AdminWriteActionSpec<GroupIdPayload, { id: string }> = {
  name: "admin.groups.close",
  keys: GROUP_ID_KEYS,
  validate: validateGroupIdPayload,
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  rpc: (client, value) =>
    adminRpc(client, "admin_close_group", { p_group_id: value.group_id }),
  revalidate: (value) => groupLifecyclePaths(value.group_id),
  noDataError: "The group was not closed. Please try again.",
};

export async function adminCloseGroup(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<GroupIdPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CLOSE_GROUP_SPEC, prev, input);
}

// ----- adminReopenGroup ----------------------------------------------------

const REOPEN_GROUP_SPEC: AdminWriteActionSpec<GroupIdPayload, { id: string }> =
  {
    name: "admin.groups.reopen",
    keys: GROUP_ID_KEYS,
    validate: validateGroupIdPayload,
    fields: (_actor, value) => ({ target_group_id: value.group_id }),
    rpc: (client, value) =>
      adminRpc(client, "admin_reopen_group", { p_group_id: value.group_id }),
    revalidate: (value) => groupLifecyclePaths(value.group_id),
    noDataError: "The group was not reopened. Please try again.",
  };

export async function adminReopenGroup(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<GroupIdPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(REOPEN_GROUP_SPEC, prev, input);
}
