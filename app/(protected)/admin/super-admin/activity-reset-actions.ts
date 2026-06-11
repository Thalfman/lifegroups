"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import { adminJsonRpc } from "@/lib/admin/rpc";
import type { ActivityResetSuccess } from "@/lib/admin/danger-zone";

// The RPC returns the baseline DATE as a jsonb scalar. Trust-boundary read:
// keep it only if it looks like a YYYY-MM-DD date, else null.
function isoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

// activity-reset: super-admin "fresh start" for the Home Recent-activity band.
// Sets a single global as-of baseline at today so every activity tile floors to
// zero, WITHOUT deleting any domain rows (groups, guests, memberships, completed
// follow-ups, care interactions are all kept). Reversible via the clear action
// below. Gated to super_admin only, even though the control renders on /admin.
export async function superAdminResetActivity(
  _prev: ActionResult<ActivityResetSuccess> | undefined,
  _input: unknown
): Promise<ActionResult<ActivityResetSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await adminJsonRpc(
    client,
    "super_admin_reset_activity",
    {}
  );
  if (error) return actionFail([mapRpcError(error.message)]);

  revalidatePath("/admin");
  revalidatePath("/admin/super-admin");
  return actionOk({ baselineOn: isoDate(data) });
}

// activity-reset: remove the global activity baseline so the Recent-activity
// tiles return to their all-time counts. The complete undo of the reset above.
export async function superAdminClearActivityReset(
  _prev: ActionResult<ActivityResetSuccess> | undefined,
  _input: unknown
): Promise<ActionResult<ActivityResetSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { error } = await adminJsonRpc(
    client,
    "super_admin_clear_activity_reset",
    {}
  );
  if (error) return actionFail([mapRpcError(error.message)]);

  revalidatePath("/admin");
  revalidatePath("/admin/super-admin");
  return actionOk({ baselineOn: null });
}
