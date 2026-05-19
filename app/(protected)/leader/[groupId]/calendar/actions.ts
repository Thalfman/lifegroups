"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireLeaderActor } from "@/lib/auth/session";
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
} from "@/lib/leader/action-result";
import {
  rpcLeaderArchiveGroupCalendarEvent,
  rpcLeaderCreateGroupCalendarEvent,
  rpcLeaderRestoreGroupCalendarEvent,
  rpcLeaderUpdateGroupCalendarEvent,
} from "@/lib/leader/rpc";

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

function revalidateLeaderCalendar(groupId: string): void {
  revalidatePath(`/leader/${groupId}/calendar`);
  revalidatePath("/leader");
}

export async function leaderCreateCalendarEvent(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireLeaderActor();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = payloadFromInput(input);
  const v = validateCalendarEventCreatePayload(raw);
  if (!v.ok) return actionFail(v.errors);

  // Defense-in-depth: the RPC also enforces auth_is_leader_of(group_id),
  // but rejecting locally avoids surfacing a generic insufficient_privilege
  // error to a leader who tampered with the form's hidden group_id field.
  if (!auth.assignedGroupIds.includes(v.value.group_id)) {
    return actionFail([
      "Only the assigned leader or co-leader can manage that group's calendar.",
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcLeaderCreateGroupCalendarEvent(client, {
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

  revalidateLeaderCalendar(v.value.group_id);
  return actionOk({ id: data });
}

export async function leaderUpdateCalendarEvent(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireLeaderActor();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = payloadFromInput(input);
  const v = validateCalendarEventUpdatePayload(raw);
  if (!v.ok) return actionFail(v.errors);

  // Defense-in-depth: confirm caller leads the group_id passed in the
  // hidden form field. The RPC re-resolves group_id from the event row
  // and checks auth_is_leader_of(event.group_id), but this client-side
  // gate avoids leaking event existence across groups for a tampered id.
  const groupId = typeof raw.group_id === "string" ? raw.group_id : null;
  if (groupId && !auth.assignedGroupIds.includes(groupId)) {
    return actionFail([
      "Only the assigned leader or co-leader can update that group's calendar.",
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcLeaderUpdateGroupCalendarEvent(client, {
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

  if (groupId) revalidateLeaderCalendar(groupId);
  return actionOk({ id: data });
}

export async function leaderArchiveCalendarEvent(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireLeaderActor();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = payloadFromInput(input);
  const v = validateCalendarEventIdPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const groupId = typeof raw.group_id === "string" ? raw.group_id : null;
  if (groupId && !auth.assignedGroupIds.includes(groupId)) {
    return actionFail([
      "Only the assigned leader or co-leader can manage that group's calendar.",
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcLeaderArchiveGroupCalendarEvent(client, {
    p_event_id: v.value.event_id,
  });
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The calendar event was not archived. Please try again."]);

  if (groupId) revalidateLeaderCalendar(groupId);
  return actionOk({ id: data });
}

export async function leaderRestoreCalendarEvent(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireLeaderActor();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = payloadFromInput(input);
  const v = validateCalendarEventIdPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const groupId = typeof raw.group_id === "string" ? raw.group_id : null;
  if (groupId && !auth.assignedGroupIds.includes(groupId)) {
    return actionFail([
      "Only the assigned leader or co-leader can manage that group's calendar.",
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcLeaderRestoreGroupCalendarEvent(client, {
    p_event_id: v.value.event_id,
  });
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The calendar event was not restored. Please try again."]);

  if (groupId) revalidateLeaderCalendar(groupId);
  return actionOk({ id: data });
}
