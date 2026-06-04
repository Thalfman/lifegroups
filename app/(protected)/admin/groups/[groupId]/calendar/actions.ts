"use server";

import {
  validateCalendarEventCreatePayload,
  validateCalendarEventIdPayload,
  validateCalendarEventUpdatePayload,
  type CalendarEventArchivePayload,
  type CalendarEventCreatePayload,
  type CalendarEventUpdatePayload,
} from "@/lib/calendar/payload";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import {
  rpcAdminArchiveGroupCalendarEvent,
  rpcAdminCreateGroupCalendarEvent,
  rpcAdminRestoreGroupCalendarEvent,
  rpcAdminUpdateGroupCalendarEvent,
} from "@/lib/admin/rpc";

// Calendar forms may post arbitrary entries, so the runner lifts the whole
// FormData rather than a fixed key list. The id-keyed actions (update,
// archive, restore) carry `group_id` only so the success path can
// revalidate the right detail page; it is not part of the validated
// payload, so it is read off `raw`.
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

function calendarPaths(groupId: string): string[] {
  return [
    `/admin/groups/${groupId}/calendar`,
    "/admin/groups",
    "/admin",
    "/admin/check-ins",
    // The per-group check-in detail surface reads calendar events for the
    // selected week, so admin calendar writes must invalidate that path
    // too -- otherwise marking a week OFF here can leave a stale "due"
    // state on /admin/check-ins/[groupId] until the next full reload.
    `/admin/check-ins/${groupId}`,
    // The Planning surface's Calendar tab aggregates every group's events into
    // the master calendar (loadMasterCalendar). It's a sidebar-prefetched,
    // router-cached path, so a group calendar write must bust it too or the
    // master calendar shows the stale event set until the cache window expires.
    "/admin/planning",
  ];
}

function groupIdFromRaw(raw: Record<string, unknown>): string | null {
  return typeof raw.group_id === "string" ? raw.group_id : null;
}

type CreateEventValue = CalendarEventCreatePayload;
type UpdateEventValue = CalendarEventUpdatePayload;
type EventIdValue = CalendarEventArchivePayload;

// ----- adminCreateCalendarEvent -------------------------------------------

const CREATE_EVENT_SPEC: AdminWriteActionSpec<CreateEventValue, { id: string }> = {
  name: "admin.calendar.create_event",
  read: payloadFromInput,
  validate: validateCalendarEventCreatePayload,
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  okFields: (value, id) => ({ event_type: value.event_type, new_event_id: id }),
  rpc: (client, value) =>
    rpcAdminCreateGroupCalendarEvent(client, {
      p_group_id: value.group_id,
      p_event_date: value.event_date,
      // Phase 5A.6 correction: meeting time is always inherited from the
      // group schedule. The calendar editor never sets a per-event time.
      p_start_time: null,
      p_end_time: null,
      p_event_type: value.event_type,
      p_status: value.status,
      p_title: value.title,
      p_description: value.description,
    }),
  revalidate: (value) => calendarPaths(value.group_id),
  noDataError: "The calendar event was not created. Please try again.",
};

export async function adminCreateCalendarEvent(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_EVENT_SPEC, prev, input);
}

// ----- adminUpdateCalendarEvent -------------------------------------------

const UPDATE_EVENT_SPEC: AdminWriteActionSpec<UpdateEventValue, { id: string }> = {
  name: "admin.calendar.update_event",
  read: payloadFromInput,
  validate: validateCalendarEventUpdatePayload,
  fields: (_actor, value) => ({ target_event_id: value.event_id }),
  okFields: (_value, _id, raw) => ({ target_group_id: groupIdFromRaw(raw) }),
  rpc: (client, value) =>
    rpcAdminUpdateGroupCalendarEvent(client, {
      p_event_id: value.event_id,
      p_event_date: value.event_date,
      p_start_time: null,
      p_end_time: null,
      p_event_type: value.event_type,
      p_status: value.status,
      p_title: value.title,
      p_description: value.description,
    }),
  revalidate: (_value, raw) => {
    const groupId = groupIdFromRaw(raw);
    return groupId ? calendarPaths(groupId) : [];
  },
  noDataError: "The calendar event was not updated. Please try again.",
};

export async function adminUpdateCalendarEvent(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_EVENT_SPEC, prev, input);
}

// ----- adminArchiveCalendarEvent ------------------------------------------

const ARCHIVE_EVENT_SPEC: AdminWriteActionSpec<EventIdValue, { id: string }> = {
  name: "admin.calendar.archive_event",
  read: payloadFromInput,
  validate: validateCalendarEventIdPayload,
  fields: (_actor, value) => ({ target_event_id: value.event_id }),
  okFields: (_value, _id, raw) => ({ target_group_id: groupIdFromRaw(raw) }),
  rpc: (client, value) =>
    rpcAdminArchiveGroupCalendarEvent(client, { p_event_id: value.event_id }),
  revalidate: (_value, raw) => {
    const groupId = groupIdFromRaw(raw);
    return groupId ? calendarPaths(groupId) : [];
  },
  noDataError: "The calendar event was not archived. Please try again.",
};

export async function adminArchiveCalendarEvent(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ARCHIVE_EVENT_SPEC, prev, input);
}

// ----- adminRestoreCalendarEvent ------------------------------------------

const RESTORE_EVENT_SPEC: AdminWriteActionSpec<EventIdValue, { id: string }> = {
  name: "admin.calendar.restore_event",
  read: payloadFromInput,
  validate: validateCalendarEventIdPayload,
  fields: (_actor, value) => ({ target_event_id: value.event_id }),
  okFields: (_value, _id, raw) => ({ target_group_id: groupIdFromRaw(raw) }),
  rpc: (client, value) =>
    rpcAdminRestoreGroupCalendarEvent(client, { p_event_id: value.event_id }),
  revalidate: (_value, raw) => {
    const groupId = groupIdFromRaw(raw);
    return groupId ? calendarPaths(groupId) : [];
  },
  noDataError: "The calendar event was not restored. Please try again.",
};

export async function adminRestoreCalendarEvent(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>,
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(RESTORE_EVENT_SPEC, prev, input);
}
