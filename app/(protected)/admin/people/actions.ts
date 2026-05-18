"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth/session";
import {
  validateCreateLeaderProfilePayload,
  validateCreateMemberPayload,
  validateAssignLeaderToGroupPayload,
  validateAssignMemberToGroupPayload,
  validateDeactivateProfilePayload,
  validateDeactivateMemberPayload,
  guardAgainstSelfTarget,
} from "@/lib/admin/validation";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import {
  rpcAdminAssignLeaderToGroup,
  rpcAdminAssignMemberToGroup,
  rpcAdminCreateLeaderProfile,
  rpcAdminCreateMember,
  rpcAdminDeactivateMember,
  rpcAdminDeactivateProfile,
} from "@/lib/admin/rpc";

const REVALIDATE_PATH = "/admin/people";

// ----- Form-payload helpers -----------------------------------------------

function readFromForm(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (input instanceof FormData) {
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const value = input.get(key);
      out[key] = value === null ? undefined : String(value);
    }
    return out;
  }
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

// useActionState callback signature: (prevState, formData). We accept both
// shapes by reading from the second argument when invoked via form, or
// from a plain object when invoked programmatically (tests, future API).
type ActionInput<T> = T | FormData;

// ----- 1. adminCreateLeaderProfile ----------------------------------------

const LEADER_KEYS = ["full_name", "email", "phone"] as const;

export async function adminCreateLeaderProfile(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<{ full_name: string; email: string; phone?: string }>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFromForm(input, LEADER_KEYS);
  const v = validateCreateLeaderProfilePayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminCreateLeaderProfile(client, {
    p_full_name: v.value.full_name,
    p_email: v.value.email,
    p_phone: v.value.phone ?? null,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The leader was not created. Please try again."]);

  revalidatePath(REVALIDATE_PATH);
  return actionOk({ id: data });
}

// ----- 2. adminCreateMember -----------------------------------------------

const MEMBER_KEYS = ["full_name", "email", "phone"] as const;

export async function adminCreateMember(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<{ full_name: string; email?: string; phone?: string }>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFromForm(input, MEMBER_KEYS);
  const v = validateCreateMemberPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminCreateMember(client, {
    p_full_name: v.value.full_name,
    p_email: v.value.email ?? null,
    p_phone: v.value.phone ?? null,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The member was not created. Please try again."]);

  revalidatePath(REVALIDATE_PATH);
  return actionOk({ id: data });
}

// ----- 3. adminAssignLeaderToGroup ----------------------------------------

const ASSIGN_LEADER_KEYS = ["group_id", "profile_id", "role"] as const;

export async function adminAssignLeaderToGroup(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<{ group_id: string; profile_id: string; role: "leader" | "co_leader" }>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFromForm(input, ASSIGN_LEADER_KEYS);
  const v = validateAssignLeaderToGroupPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const guard = guardAgainstSelfTarget(auth.session.profile.id, v.value.profile_id);
  if (guard) return actionFail([guard]);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminAssignLeaderToGroup(client, {
    p_group_id: v.value.group_id,
    p_profile_id: v.value.profile_id,
    p_role: v.value.role,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The assignment was not saved. Please try again."]);

  revalidatePath(REVALIDATE_PATH);
  return actionOk({ id: data });
}

// ----- 4. adminAssignMemberToGroup ----------------------------------------

const ASSIGN_MEMBER_KEYS = ["group_id", "member_id"] as const;

export async function adminAssignMemberToGroup(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<{ group_id: string; member_id: string }>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFromForm(input, ASSIGN_MEMBER_KEYS);
  const v = validateAssignMemberToGroupPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminAssignMemberToGroup(client, {
    p_group_id: v.value.group_id,
    p_member_id: v.value.member_id,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The assignment was not saved. Please try again."]);

  revalidatePath(REVALIDATE_PATH);
  return actionOk({ id: data });
}

// ----- 5. adminDeactivateProfile ------------------------------------------

const DEACTIVATE_PROFILE_KEYS = ["profile_id"] as const;

export async function adminDeactivateProfile(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<{ profile_id: string }>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFromForm(input, DEACTIVATE_PROFILE_KEYS);
  const v = validateDeactivateProfilePayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const guard = guardAgainstSelfTarget(auth.session.profile.id, v.value.profile_id);
  if (guard) return actionFail([guard]);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminDeactivateProfile(client, {
    p_profile_id: v.value.profile_id,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The profile was not deactivated. Please try again."]);

  revalidatePath(REVALIDATE_PATH);
  return actionOk({ id: data });
}

// ----- 6. adminDeactivateMember -------------------------------------------

const DEACTIVATE_MEMBER_KEYS = ["member_id"] as const;

export async function adminDeactivateMember(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<{ member_id: string }>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFromForm(input, DEACTIVATE_MEMBER_KEYS);
  const v = validateDeactivateMemberPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminDeactivateMember(client, {
    p_member_id: v.value.member_id,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The member was not deactivated. Please try again."]);

  revalidatePath(REVALIDATE_PATH);
  return actionOk({ id: data });
}

// ----- Out of scope for Phase 5A.1 / 5A.3 ---------------------------------
// adminChangeUserRole has been removed in Phase 5A.3 -- the live role-change
// workflow now lives at app/(protected)/admin/super-admin/actions.ts. The
// remaining stub stays here for out-of-scope workflows that no UI hits today.

const NOT_ENABLED =
  "This admin workflow is intentionally out of scope for Phase 5A.1.";

export async function adminCreateMinistryAdmin(_input: unknown): Promise<never> {
  throw new Error(NOT_ENABLED);
}
