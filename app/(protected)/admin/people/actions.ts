"use server";

import { hashEmail } from "@/lib/observability/identifiers";
import {
  validateCreateLeaderProfilePayload,
  validateCreateMemberPayload,
  validateAssignLeaderToGroupPayload,
  validateAssignMemberToGroupPayload,
  validateChangeLeaderRolePayload,
  validateDeactivateProfilePayload,
  validateDeactivateMemberPayload,
  guardAgainstSelfTarget,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import {
  rpcAdminAssignLeaderToGroup,
  rpcAdminAssignMemberToGroup,
  rpcAdminChangeLeaderRole,
  rpcAdminCreateLeaderProfile,
  rpcAdminCreateMember,
  rpcAdminDeactivateMember,
  rpcAdminDeactivateProfile,
} from "@/lib/admin/rpc";

const REVALIDATE_PATH = "/admin/people";

// ----- 1. adminCreateLeaderProfile ----------------------------------------

type CreateLeaderPayload = { full_name: string; email: string; phone?: string };

const CREATE_LEADER_SPEC: AdminWriteActionSpec<
  CreateLeaderPayload,
  { id: string }
> = {
  name: "admin.people.create_leader",
  keys: ["full_name", "email", "phone"],
  validate: validateCreateLeaderProfilePayload,
  fields: async (_actor, value) => ({
    target_email_hash: await hashEmail(value.email),
  }),
  okFields: (_value, id) => ({ new_profile_id: id }),
  rpc: (client, value) =>
    rpcAdminCreateLeaderProfile(client, {
      p_full_name: value.full_name,
      p_email: value.email,
      p_phone: value.phone ?? null,
    }),
  revalidate: () => REVALIDATE_PATH,
  noDataError: "The leader was not created. Please try again.",
};

export async function adminCreateLeaderProfile(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<CreateLeaderPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_LEADER_SPEC, prev, input);
}

// ----- 2. adminCreateMember -----------------------------------------------

type CreateMemberPayload = {
  full_name: string;
  email?: string;
  phone?: string;
};

const CREATE_MEMBER_SPEC: AdminWriteActionSpec<
  CreateMemberPayload,
  { id: string }
> = {
  name: "admin.people.create_member",
  keys: ["full_name", "email", "phone"],
  validate: validateCreateMemberPayload,
  fields: async (_actor, value) => ({
    target_email_hash: value.email ? await hashEmail(value.email) : null,
  }),
  okFields: (_value, id) => ({ new_profile_id: id }),
  rpc: (client, value) =>
    rpcAdminCreateMember(client, {
      p_full_name: value.full_name,
      p_email: value.email ?? null,
      p_phone: value.phone ?? null,
    }),
  revalidate: () => REVALIDATE_PATH,
  noDataError: "The member was not created. Please try again.",
};

export async function adminCreateMember(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<CreateMemberPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_MEMBER_SPEC, prev, input);
}

// ----- 3. adminAssignLeaderToGroup ----------------------------------------

type AssignLeaderPayload = {
  group_id: string;
  profile_id: string;
  role: "leader" | "co_leader";
};

const ASSIGN_LEADER_SPEC: AdminWriteActionSpec<
  AssignLeaderPayload,
  { id: string }
> = {
  name: "admin.people.assign_leader_to_group",
  keys: ["group_id", "profile_id", "role"],
  validate: validateAssignLeaderToGroupPayload,
  guard: (actor, value) => {
    const error = guardAgainstSelfTarget(actor.id, value.profile_id);
    return error ? { error, code: "self_guard" } : null;
  },
  fields: (_actor, value) => ({
    target_group_id: value.group_id,
    target_profile_id: value.profile_id,
  }),
  okFields: (value) => ({ assigned_role: value.role }),
  rpc: (client, value) =>
    rpcAdminAssignLeaderToGroup(client, {
      p_group_id: value.group_id,
      p_profile_id: value.profile_id,
      p_role: value.role,
    }),
  // Placement can now be driven from a person's detail page (Group tab) as well
  // as the People directory, so refresh both the People surface and that
  // person's detail route — otherwise the detail page's server-rendered
  // "Current group assignment" panel would keep showing the stale roster.
  revalidate: (value) => [
    REVALIDATE_PATH,
    `/admin/people/profile/${value.profile_id}`,
  ],
  noDataError: "The assignment was not saved. Please try again.",
};

export async function adminAssignLeaderToGroup(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<AssignLeaderPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ASSIGN_LEADER_SPEC, prev, input);
}

// ----- 4. adminAssignMemberToGroup ----------------------------------------

type AssignMemberPayload = { group_id: string; member_id: string };

const ASSIGN_MEMBER_SPEC: AdminWriteActionSpec<
  AssignMemberPayload,
  { id: string }
> = {
  name: "admin.people.assign_member_to_group",
  keys: ["group_id", "member_id"],
  validate: validateAssignMemberToGroupPayload,
  fields: (_actor, value) => ({
    target_group_id: value.group_id,
    target_member_id: value.member_id,
  }),
  rpc: (client, value) =>
    rpcAdminAssignMemberToGroup(client, {
      p_group_id: value.group_id,
      p_member_id: value.member_id,
    }),
  revalidate: (value) => [
    REVALIDATE_PATH,
    `/admin/people/member/${value.member_id}`,
  ],
  noDataError: "The assignment was not saved. Please try again.",
};

export async function adminAssignMemberToGroup(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<AssignMemberPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ASSIGN_MEMBER_SPEC, prev, input);
}

// ----- 5. adminDeactivateProfile ------------------------------------------

type DeactivateProfilePayload = { profile_id: string };

const DEACTIVATE_PROFILE_SPEC: AdminWriteActionSpec<
  DeactivateProfilePayload,
  { id: string }
> = {
  name: "admin.people.deactivate_profile",
  keys: ["profile_id"],
  validate: validateDeactivateProfilePayload,
  guard: (actor, value) => {
    const error = guardAgainstSelfTarget(actor.id, value.profile_id);
    return error ? { error, code: "self_guard" } : null;
  },
  fields: (_actor, value) => ({ target_profile_id: value.profile_id }),
  rpc: (client, value) =>
    rpcAdminDeactivateProfile(client, { p_profile_id: value.profile_id }),
  revalidate: () => REVALIDATE_PATH,
  noDataError: "The profile was not deactivated. Please try again.",
};

export async function adminDeactivateProfile(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<DeactivateProfilePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(DEACTIVATE_PROFILE_SPEC, prev, input);
}

// ----- 6. adminDeactivateMember -------------------------------------------

type DeactivateMemberPayload = { member_id: string };

const DEACTIVATE_MEMBER_SPEC: AdminWriteActionSpec<
  DeactivateMemberPayload,
  { id: string }
> = {
  name: "admin.people.deactivate_member",
  keys: ["member_id"],
  validate: validateDeactivateMemberPayload,
  fields: (_actor, value) => ({ target_member_id: value.member_id }),
  rpc: (client, value) =>
    rpcAdminDeactivateMember(client, { p_member_id: value.member_id }),
  revalidate: () => REVALIDATE_PATH,
  noDataError: "The member was not deactivated. Please try again.",
};

export async function adminDeactivateMember(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<DeactivateMemberPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(DEACTIVATE_MEMBER_SPEC, prev, input);
}

// ----- 7. adminChangeLeaderRole (Phase 5A.4) ------------------------------
//
// Ministry-admin-safe role swap between `leader` and `co_leader`. Both
// super_admin and ministry_admin can call this. The RPC enforces the
// narrow target/new-role envelope; the TS guard here is defense in depth
// so the friendly error surfaces before we even hit Supabase.

type ChangeLeaderRolePayload = {
  profile_id: string;
  new_role: "leader" | "co_leader";
};

const CHANGE_LEADER_ROLE_SPEC: AdminWriteActionSpec<
  ChangeLeaderRolePayload,
  { id: string }
> = {
  name: "admin.people.change_leader_role",
  keys: ["profile_id", "new_role"],
  validate: validateChangeLeaderRolePayload,
  guard: (actor, value) => {
    const error = guardAgainstSelfTarget(actor.id, value.profile_id);
    return error ? { error, code: "self_guard" } : null;
  },
  fields: (_actor, value) => ({
    target_profile_id: value.profile_id,
    new_role: value.new_role,
  }),
  rpc: (client, value) =>
    rpcAdminChangeLeaderRole(client, {
      p_profile_id: value.profile_id,
      p_new_role: value.new_role,
    }),
  revalidate: () => REVALIDATE_PATH,
  noDataError: "The role was not updated. Please try again.",
};

export async function adminChangeLeaderRole(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<ChangeLeaderRolePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CHANGE_LEADER_ROLE_SPEC, prev, input);
}

// ----- Out of scope for Phase 5A.1 / 5A.3 ---------------------------------
// adminChangeUserRole has been removed in Phase 5A.3 -- the live role-change
// workflow now lives at app/(protected)/admin/super-admin/actions.ts. The
// remaining stub stays here for out-of-scope workflows that no UI hits today.

const NOT_ENABLED =
  "This admin workflow is intentionally out of scope for Phase 5A.1.";

export async function adminCreateMinistryAdmin(
  _input: unknown
): Promise<never> {
  throw new Error(NOT_ENABLED);
}
