"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import {
  guardAgainstSelfRoleChange,
  guardAgainstStaffViewerAssignment,
  guardAgainstSuperAdminAssignment,
  validateChangeUserRolePayload,
} from "@/lib/admin/validation";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import { rpcSuperAdminUpdateProfileRole } from "@/lib/admin/rpc";
import type { UserRole } from "@/types/enums";

const REVALIDATE_PATH = "/admin/super-admin";

const ROLE_CHANGE_KEYS = ["profile_id", "new_role"] as const;

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

type ActionInput<T> = T | FormData;

export async function superAdminUpdateProfileRole(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<{ profile_id: string; new_role: UserRole }>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFromForm(input, ROLE_CHANGE_KEYS);
  const v = validateChangeUserRolePayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const selfGuard = guardAgainstSelfRoleChange(
    { id: auth.session.profile.id, role: auth.session.profile.role },
    v.value,
  );
  if (selfGuard) return actionFail([selfGuard]);

  const superGuard = guardAgainstSuperAdminAssignment(v.value);
  if (superGuard) return actionFail([superGuard]);

  const staffGuard = guardAgainstStaffViewerAssignment(v.value);
  if (staffGuard) return actionFail([staffGuard]);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcSuperAdminUpdateProfileRole(client, {
    p_profile_id: v.value.profile_id,
    p_new_role: v.value.new_role,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The role was not updated. Please try again."]);

  revalidatePath(REVALIDATE_PATH);
  return actionOk({ id: data });
}
