"use server";

import { requireSuperAdminSession } from "@/lib/auth/session";
import {
  guardAgainstSelfRoleChange,
  guardAgainstSuperAdminAssignment,
  validateChangeUserRolePayload,
  type ChangeUserRolePayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { rpcSuperAdminUpdateProfileRole } from "@/lib/admin/rpc";

const REVALIDATE_PATH = "/admin/super-admin";

const ROLE_CHANGE_KEYS = ["profile_id", "new_role"] as const;

const UPDATE_PROFILE_ROLE_SPEC: AdminWriteActionSpec<
  ChangeUserRolePayload,
  { id: string }
> = {
  name: "admin.super_admin.update_profile_role",
  // super_admin-only console: tightens the role check to super_admin alone
  // so role-management writes never accept a ministry_admin caller.
  auth: requireSuperAdminSession,
  keys: ROLE_CHANGE_KEYS,
  validate: validateChangeUserRolePayload,
  // Defense-in-depth checks, surfaced before the RPC. Returns the first
  // denial, each with its own error_code, mirroring the prior sequential
  // guard checks.
  guard: (actor, value) => {
    const selfGuard = guardAgainstSelfRoleChange(
      { id: actor.id, role: actor.role },
      value
    );
    if (selfGuard) return { error: selfGuard, code: "self_guard" };

    const superGuard = guardAgainstSuperAdminAssignment(value);
    if (superGuard) {
      return { error: superGuard, code: "super_admin_assignment_blocked" };
    }

    return null;
  },
  fields: (_actor, value) => ({
    target_profile_id: value.profile_id,
    new_role: value.new_role,
  }),
  rpc: (client, value) =>
    rpcSuperAdminUpdateProfileRole(client, {
      p_profile_id: value.profile_id,
      p_new_role: value.new_role,
    }),
  revalidate: () => REVALIDATE_PATH,
  noDataError: "The role was not updated. Please try again.",
};

export async function superAdminUpdateProfileRole(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<{
    profile_id: string;
    new_role: ChangeUserRolePayload["new_role"];
  }>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_PROFILE_ROLE_SPEC, prev, input);
}
