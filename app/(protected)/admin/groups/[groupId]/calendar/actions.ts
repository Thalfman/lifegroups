"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth/session";
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
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = payloadFromInput(input);
  const v = validateCalendarEventCreatePayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminCreateGroupCalendarEvent(client, {
    p_group_id: v.value.group_id,
    p_event_date: v.value.event_date,
    p_start_time: v.value.start_time,
    p_end_time: v.value.end_time,
    p_event_type: v.value.event_type,
    p_status: v.value.status,
    p_title: v.value.title,
    p_description: v.value.description,
  });
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The calendar event was not created. Please try again."]);

  revalidateAdminCalendar(v.value.group_id);
  return actionOk({ id: data });
}

export async function adminUpdateCalendarEvent(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = payloadFromInput(input);
  const v = validateCalendarEventUpdatePayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminUpdateGroupCalendarEvent(client, {
    p_event_id: v.value.event_id,
    p_event_date: v.value.event_date,
    p_start_time: v.value.start_time,
    p_end_time: v.value.end_time,
    p_event_type: v.value.event_type,
    p_status: v.value.status,
    p_title: v.value.title,
    p_description: v.value.description,
  });
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The calendar event was not updated. Please try again."]);

  const groupId = typeof raw.group_id === "string" ? raw.group_id : null;
  if (groupId) revalidateAdminCalendar(groupId);
  return actionOk({ id: data });
}

export async function adminArchiveCalendarEvent(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = payloadFromInput(input);
  const v = validateCalendarEventIdPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminArchiveGroupCalendarEvent(client, {
    p_event_id: v.value.event_id,
  });
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The calendar event was not archived. Please try again."]);

  const groupId = typeof raw.group_id === "string" ? raw.group_id : null;
  if (groupId) revalidateAdminCalendar(groupId);
  return actionOk({ id: data });
}

export async function adminRestoreCalendarEvent(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = payloadFromInput(input);
  const v = validateCalendarEventIdPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcAdminRestoreGroupCalendarEvent(client, {
    p_event_id: v.value.event_id,
  });
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The calendar event was not restored. Please try again."]);

  const groupId = typeof raw.group_id === "string" ? raw.group_id : null;
  if (groupId) revalidateAdminCalendar(groupId);
  return actionOk({ id: data });
}
