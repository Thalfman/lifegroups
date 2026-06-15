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
  validateEndGroupMembershipPayload,
  validateUnassignLeaderFromGroupPayload,
  guardAgainstSelfTarget,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc, type AdminUuidRpcArgs } from "@/lib/admin/rpc";

const REVALIDATE_PATH = "/admin/people";

// ----- 1. adminCreateLeaderProfile ----------------------------------------

type CreateLeaderPayload = { full_name: string; email: string; phone?: string };

// Type-pinned RPC-args mapping (issue #636): the input is pinned to the
// validator's output type (CreateLeaderPayload) and the return to the RPC's
// declared p_* args, so a validator field rename that desyncs from the args
// fails `npm run typecheck` instead of silently shipping the wrong shape to the
// SECURITY DEFINER RPC. The explicit per-field spelling stays the eyeball-able
// write-side trust boundary — this only pins its two ends.
const createLeaderRpcArgs = (
  value: CreateLeaderPayload
): AdminUuidRpcArgs["admin_create_leader_profile"] => ({
  p_full_name: value.full_name,
  p_email: value.email,
  p_phone: value.phone ?? null,
});

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
    adminRpc(client, "admin_create_leader_profile", createLeaderRpcArgs(value)),
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
    adminRpc(client, "admin_create_member", {
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
    adminRpc(client, "admin_assign_leader_to_group", {
      p_group_id: value.group_id,
      p_profile_id: value.profile_id,
      p_role: value.role,
    }),
  // Assignment can be driven from a person's detail page (Group tab), the
  // People directory, or the group's own People tab, so refresh all three —
  // otherwise a server-rendered roster panel would keep showing stale data.
  revalidate: (value) => [
    REVALIDATE_PATH,
    `/admin/people/profile/${value.profile_id}`,
    `/admin/groups/${value.group_id}`,
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
    adminRpc(client, "admin_assign_member_to_group", {
      p_group_id: value.group_id,
      p_member_id: value.member_id,
    }),
  revalidate: (value) => [
    REVALIDATE_PATH,
    `/admin/people/member/${value.member_id}`,
    `/admin/groups/${value.group_id}`,
  ],
  noDataError: "The assignment was not saved. Please try again.",
};

export async function adminAssignMemberToGroup(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<AssignMemberPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ASSIGN_MEMBER_SPEC, prev, input);
}

// ----- 4b. adminUnassignLeaderFromGroup -------------------------------------
//
// Roster removal: take one leader off one group's roster (group_leaders.active
// := false) without touching their profile status — the inverse of
// adminAssignLeaderToGroup, driven from the group detail's People tab.

type UnassignLeaderPayload = { group_id: string; profile_id: string };

const UNASSIGN_LEADER_SPEC: AdminWriteActionSpec<
  UnassignLeaderPayload,
  { id: string }
> = {
  name: "admin.people.unassign_leader_from_group",
  keys: ["group_id", "profile_id"],
  validate: validateUnassignLeaderFromGroupPayload,
  guard: (actor, value) => {
    const error = guardAgainstSelfTarget(actor.id, value.profile_id);
    return error ? { error, code: "self_guard" } : null;
  },
  fields: (_actor, value) => ({
    target_group_id: value.group_id,
    target_profile_id: value.profile_id,
  }),
  rpc: (client, value) =>
    adminRpc(client, "admin_unassign_leader_from_group", {
      p_group_id: value.group_id,
      p_profile_id: value.profile_id,
    }),
  revalidate: (value) => [
    REVALIDATE_PATH,
    `/admin/people/profile/${value.profile_id}`,
    `/admin/groups/${value.group_id}`,
  ],
  noDataError: "The leader was not removed from the group. Please try again.",
};

export async function adminUnassignLeaderFromGroup(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UnassignLeaderPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UNASSIGN_LEADER_SPEC, prev, input);
}

// ----- 4c. adminEndGroupMembership ------------------------------------------
//
// Roster removal: end one member's active membership in one group (status →
// inactive, ended_at = today) without touching the member's status — the
// inverse of adminAssignMemberToGroup.

type EndMembershipPayload = { group_id: string; member_id: string };

const END_MEMBERSHIP_SPEC: AdminWriteActionSpec<
  EndMembershipPayload,
  { id: string }
> = {
  name: "admin.people.end_group_membership",
  keys: ["group_id", "member_id"],
  validate: validateEndGroupMembershipPayload,
  fields: (_actor, value) => ({
    target_group_id: value.group_id,
    target_member_id: value.member_id,
  }),
  rpc: (client, value) =>
    adminRpc(client, "admin_end_group_membership", {
      p_group_id: value.group_id,
      p_member_id: value.member_id,
    }),
  revalidate: (value) => [
    REVALIDATE_PATH,
    `/admin/people/member/${value.member_id}`,
    `/admin/groups/${value.group_id}`,
  ],
  noDataError: "The member was not removed from the group. Please try again.",
};

export async function adminEndGroupMembership(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<EndMembershipPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(END_MEMBERSHIP_SPEC, prev, input);
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
    adminRpc(client, "admin_deactivate_profile", {
      p_profile_id: value.profile_id,
    }),
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
    adminRpc(client, "admin_deactivate_member", {
      p_member_id: value.member_id,
    }),
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
    adminRpc(client, "admin_change_leader_role", {
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
