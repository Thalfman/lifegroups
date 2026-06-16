"use server";

import { requireSuperAdminSession } from "@/lib/auth/session";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminJsonRpc } from "@/lib/admin/rpc";
import type { ActivityResetSuccess } from "@/lib/admin/danger-zone";

const REVALIDATE_PATHS = ["/admin", "/admin/super-admin"] as const;

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
//
// `D` is the parsed success shape, built in `rpc` so the jsonb baseline is read
// at the trust boundary once: the success value is always non-null (a null
// baseline is a legitimate `{ baselineOn: null }`, not a no-data failure).
const RESET_ACTIVITY_SPEC: AdminWriteActionSpec<
  Record<string, never>,
  ActivityResetSuccess,
  ActivityResetSuccess
> = {
  name: "super_admin.reset_activity",
  auth: requireSuperAdminSession,
  validate: () => ({ ok: true, value: {} }),
  rpc: async (client) => {
    const { data, error } = await adminJsonRpc(
      client,
      "super_admin_reset_activity",
      {}
    );
    return error
      ? { data: null, error }
      : { data: { baselineOn: isoDate(data) }, error: null };
  },
  result: (data) => data,
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The activity baseline was not set. Please try again.",
};

export async function superAdminResetActivity(
  prev: ActionResult<ActivityResetSuccess> | undefined,
  input: unknown
): Promise<ActionResult<ActivityResetSuccess>> {
  return runAdminWriteAction(RESET_ACTIVITY_SPEC, prev, input);
}

// activity-reset: remove the global activity baseline so the Recent-activity
// tiles return to their all-time counts. The complete undo of the reset above.
// The RPC's return is not part of the success summary, so `rpc` discards it and
// reports a fixed `{ baselineOn: null }` shape (kept non-null so a successful
// clear never trips the runner's no-data gate).
const CLEAR_ACTIVITY_RESET_SPEC: AdminWriteActionSpec<
  Record<string, never>,
  ActivityResetSuccess,
  ActivityResetSuccess
> = {
  name: "super_admin.clear_activity_reset",
  auth: requireSuperAdminSession,
  validate: () => ({ ok: true, value: {} }),
  rpc: async (client) => {
    const { error } = await adminJsonRpc(
      client,
      "super_admin_clear_activity_reset",
      {}
    );
    return error
      ? { data: null, error }
      : { data: { baselineOn: null }, error: null };
  },
  result: (data) => data,
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The activity baseline was not cleared. Please try again.",
};

export async function superAdminClearActivityReset(
  prev: ActionResult<ActivityResetSuccess> | undefined,
  input: unknown
): Promise<ActionResult<ActivityResetSuccess>> {
  return runAdminWriteAction(CLEAR_ACTIVITY_RESET_SPEC, prev, input);
}
