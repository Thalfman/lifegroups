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
  // The check-in page reads calendar events to compute the due-date
  // label / OFF-week suppression. Without revalidating this path,
  // marking a week OFF here can leave a stale "due Tuesday 7pm" on
  // the check-in screen until the next full reload.
  revalidatePath(`/leader/${groupId}/checkin`);
  revalidatePath("/leader");
}

// Leader event-by-id actions require the form to submit the parent
// group_id alongside event_id. Without it, an action that omits the
// hidden field would fall through to the RPC and could leak whether an
// event_id exists in another group via the difference between
// missing_event and insufficient_privilege errors. We reject any
// submission missing a group_id the leader actually leads -- the RPC
// also normalizes those cases, but this client-side guard keeps the
// error surface tight.
function requireOwnedGroupId(
  raw: Record<string, unknown>,
  assignedGroupIds: string[],
): { ok: true; groupId: string } | { ok: false; error: string } {
  const value = typeof raw.group_id === "string" ? raw.group_id.trim() : "";
  if (!value) {
    return {
      ok: false,
      error: "group_id is required for leader calendar mutations.",
    };
  }
  if (!assignedGroupIds.includes(value)) {
    return {
      ok: false,
      error: "Only the assigned leader or co-leader can manage that group's calendar.",
    };
  }
  return { ok: true, groupId: value };
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
  const ownership = requireOwnedGroupId(raw, auth.assignedGroupIds);
  if (!ownership.ok) return actionFail([ownership.error]);

  const v = validateCalendarEventUpdatePayload(raw);
  if (!v.ok) return actionFail(v.errors);

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

  revalidateLeaderCalendar(ownership.groupId);
  return actionOk({ id: data });
}

export async function leaderArchiveCalendarEvent(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireLeaderActor();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = payloadFromInput(input);
  const ownership = requireOwnedGroupId(raw, auth.assignedGroupIds);
  if (!ownership.ok) return actionFail([ownership.error]);

  const v = validateCalendarEventIdPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcLeaderArchiveGroupCalendarEvent(client, {
    p_event_id: v.value.event_id,
  });
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The calendar event was not archived. Please try again."]);

  revalidateLeaderCalendar(ownership.groupId);
  return actionOk({ id: data });
}

export async function leaderRestoreCalendarEvent(
  _prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireLeaderActor();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = payloadFromInput(input);
  const ownership = requireOwnedGroupId(raw, auth.assignedGroupIds);
  if (!ownership.ok) return actionFail([ownership.error]);

  const v = validateCalendarEventIdPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcLeaderRestoreGroupCalendarEvent(client, {
    p_event_id: v.value.event_id,
  });
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The calendar event was not restored. Please try again."]);

  revalidateLeaderCalendar(ownership.groupId);
  return actionOk({ id: data });
}
