"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth/session";
import { startActionLog } from "@/lib/observability/instrument";
import {
  validateCalendarEventCreatePayload,
  validateCalendarEventIdPayload,
  validateCalendarEventUpdatePayload,
} from "@/lib/calendar/payload";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import {
  rpcAdminArchiveGroupCalendarEvent,
  rpcAdminCreateGroupCalendarEvent,
  rpcAdminRestoreGroupCalendarEvent,
  rpcAdminUpdateGroupCalendarEvent,
} from "@/lib/admin/rpc";

type ActionInput<T> = T | FormData;

function payloadFromInput(input: unknown): Record<string, unknown> {
  if (input instanceof FormData) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of input.entries()) {
      out[key] = typeof value === "string" ? value : undefined;
    }
    return out;
  }
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function revalidateAdminCalendar(groupId: string): void {
  revalidatePath(`/admin/groups/${groupId}/calendar`);
  revalidatePath("/admin/groups");
  revalidatePath("/admin");
  revalidatePath("/admin/check-ins");
  // The per-group check-in detail surface reads calendar events for the
  // selected week, so admin calendar writes must invalidate that path
  // too -- otherwise marking a week OFF here can leave a stale "due"
  // state on /admin/check-ins/[groupId] until the next full reload.
  revalidatePath(`/admin/check-ins/${groupId}`);
}

export async function adminCreateCalendarEvent(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.calendar.create_event");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = payloadFromInput(input);
  const v = validateCalendarEventCreatePayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminCreateGroupCalendarEvent(client, {
    p_group_id: v.value.group_id,
    p_event_date: v.value.event_date,
    // Phase 5A.6 correction: meeting time is always inherited from the
    // group schedule. The calendar editor never sets a per-event time.
    p_start_time: null,
    p_end_time: null,
    p_event_type: v.value.event_type,
    p_status: v.value.status,
    p_title: v.value.title,
    p_description: v.value.description,
  });
  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role,
      target_group_id: v.value.group_id,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      actor_role,
      target_group_id: v.value.group_id,
    });
    return actionFail(["The calendar event was not created. Please try again."]);
  }

  revalidateAdminCalendar(v.value.group_id);
  ctx.finish("ok", {
    actor_role,
    target_group_id: v.value.group_id,
    event_type: v.value.event_type,
    new_event_id: data,
  });
  return actionOk({ id: data });
}

export async function adminUpdateCalendarEvent(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.calendar.update_event");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = payloadFromInput(input);
  const v = validateCalendarEventUpdatePayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminUpdateGroupCalendarEvent(client, {
    p_event_id: v.value.event_id,
    p_event_date: v.value.event_date,
    p_start_time: null,
    p_end_time: null,
    p_event_type: v.value.event_type,
    p_status: v.value.status,
    p_title: v.value.title,
    p_description: v.value.description,
  });
  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role,
      target_event_id: v.value.event_id,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      actor_role,
      target_event_id: v.value.event_id,
    });
    return actionFail(["The calendar event was not updated. Please try again."]);
  }

  const groupId = typeof raw.group_id === "string" ? raw.group_id : null;
  if (groupId) revalidateAdminCalendar(groupId);
  ctx.finish("ok", {
    actor_role,
    target_event_id: v.value.event_id,
    target_group_id: groupId,
  });
  return actionOk({ id: data });
}

export async function adminArchiveCalendarEvent(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.calendar.archive_event");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = payloadFromInput(input);
  const v = validateCalendarEventIdPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminArchiveGroupCalendarEvent(client, {
    p_event_id: v.value.event_id,
  });
  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role,
      target_event_id: v.value.event_id,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      actor_role,
      target_event_id: v.value.event_id,
    });
    return actionFail(["The calendar event was not archived. Please try again."]);
  }

  const groupId = typeof raw.group_id === "string" ? raw.group_id : null;
  if (groupId) revalidateAdminCalendar(groupId);
  ctx.finish("ok", {
    actor_role,
    target_event_id: v.value.event_id,
    target_group_id: groupId,
  });
  return actionOk({ id: data });
}

export async function adminRestoreCalendarEvent(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = startActionLog("admin.calendar.restore_event");

  const auth = await requireAdminSession();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor_role = auth.session.profile.role;

  const raw = payloadFromInput(input);
  const v = validateCalendarEventIdPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", actor_role });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcAdminRestoreGroupCalendarEvent(client, {
    p_event_id: v.value.event_id,
  });
  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role,
      target_event_id: v.value.event_id,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      actor_role,
      target_event_id: v.value.event_id,
    });
    return actionFail(["The calendar event was not restored. Please try again."]);
  }

  const groupId = typeof raw.group_id === "string" ? raw.group_id : null;
  if (groupId) revalidateAdminCalendar(groupId);
  ctx.finish("ok", {
    actor_role,
    target_event_id: v.value.event_id,
    target_group_id: groupId,
  });
  return actionOk({ id: data });
}
