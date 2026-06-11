"use server";

import {
  validatePlatformConfigPayload,
  type PlatformConfigPayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";
import { requireSuperAdminSession } from "@/lib/auth/session";

// Phase SAC.1 (#159): the Super Admin Console's audited write for platform
// config. Routed through the shared admin write runner — same auth -> validate
// -> RPC -> revalidate -> log skeleton as every other admin write — but with
// the super-admin gate so a ministry_admin caller is denied, and the RPC emits
// a paired audit_events row in the same transaction. No service-role writes.
const SET_PLATFORM_CONFIG_SPEC: AdminWriteActionSpec<
  PlatformConfigPayload,
  { id: string }
> = {
  name: "super_admin.set_platform_config",
  auth: requireSuperAdminSession,
  // Lift just the tracer field from the form; an absent field is a cleared note.
  read: (input) =>
    input instanceof FormData
      ? { console_tracer_note: input.get("console_tracer_note") ?? "" }
      : typeof input === "object" && input !== null
        ? (input as Record<string, unknown>)
        : {},
  validate: validatePlatformConfigPayload,
  rpc: (client, value) =>
    adminRpc(client, "super_admin_set_platform_config", {
      p_config: { console_tracer_note: value.console_tracer_note },
    }),
  revalidate: () => ["/admin/super-admin"],
  noDataError: "The platform config was not saved. Please try again.",
};

export async function superAdminSetPlatformConfig(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_PLATFORM_CONFIG_SPEC, prev, input);
}
