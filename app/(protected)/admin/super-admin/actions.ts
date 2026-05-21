"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import { startActionLog } from "@/lib/observability/instrument";
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
const EVENT = "admin.super_admin.update_profile_role";

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
  const ctx = startActionLog(EVENT);

  const auth = await requireSuperAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }

  const raw = readFromForm(input, ROLE_CHANGE_KEYS);
  const v = validateChangeUserRolePayload(raw);
  if (!v.ok) {
    ctx.finish("fail", {
      error_code: "validation_failed",
      actor_role: auth.session.profile.role,
      error_count: v.errors.length,
    });
    return actionFail(v.errors);
  }

  const selfGuard = guardAgainstSelfRoleChange(
    { id: auth.session.profile.id, role: auth.session.profile.role },
    v.value,
  );
  if (selfGuard) {
    ctx.finish("denied", {
      error_code: "self_guard",
      actor_role: auth.session.profile.role,
    });
    return actionFail([selfGuard]);
  }

  const superGuard = guardAgainstSuperAdminAssignment(v.value);
  if (superGuard) {
    ctx.finish("denied", {
      error_code: "super_admin_assignment_blocked",
      actor_role: auth.session.profile.role,
    });
    return actionFail([superGuard]);
  }

  const staffGuard = guardAgainstStaffViewerAssignment(v.value);
  if (staffGuard) {
    ctx.finish("denied", {
      error_code: "staff_viewer_assignment_blocked",
      actor_role: auth.session.profile.role,
    });
    return actionFail([staffGuard]);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", {
      error_code: "supabase_not_configured",
      actor_role: auth.session.profile.role,
    });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcSuperAdminUpdateProfileRole(client, {
    p_profile_id: v.value.profile_id,
    p_new_role: v.value.new_role,
  });

  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role: auth.session.profile.role,
      target_profile_id: v.value.profile_id,
      new_role: v.value.new_role,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      actor_role: auth.session.profile.role,
      target_profile_id: v.value.profile_id,
    });
    return actionFail(["The role was not updated. Please try again."]);
  }

  revalidatePath(REVALIDATE_PATH);
  ctx.finish("ok", {
    actor_role: auth.session.profile.role,
    target_profile_id: v.value.profile_id,
    new_role: v.value.new_role,
  });
  return actionOk({ id: data });
}
