"use server";

import {
  validateCalendarEventCreatePayload,
  validateCalendarEventIdPayload,
  validateCalendarEventUpdatePayload,
  type CalendarEventArchivePayload,
  type CalendarEventCreatePayload,
  type CalendarEventUpdatePayload,
} from "@/lib/calendar/payload";
import { type ActionResult } from "@/lib/leader/action-result";
import {
  runLeaderWriteAction,
  type LeaderWriteActionSpec,
} from "@/lib/leader/run-action";
import { leaderRpc } from "@/lib/leader/rpc";
import { readFormPayload } from "@/lib/shared/form-data";
import { toRpcArgs } from "@/lib/shared/rpc-args";

type ActionInput<T> = T | FormData;

const CALENDAR_NOT_ASSIGNED =
  "Only the assigned shepherd or co-shepherd can manage that group's calendar.";

function leaderCalendarPaths(groupId: string): string[] {
  return [
    `/leader/${groupId}/calendar`,
    // The check-in page reads calendar events to compute the due-date label
    // / OFF-week suppression. Without revalidating this path, marking a week
    // OFF here can leave a stale "due Tuesday 7pm" on the check-in screen
    // until the next full reload.
    `/leader/${groupId}/checkin`,
    "/leader",
  ];
}

function rawGroupId(raw: Record<string, unknown>): string {
  return typeof raw.group_id === "string" ? raw.group_id.trim() : "";
}

// Leader event-by-id actions require the form to submit the parent group_id
// alongside event_id. Without it, an action that omits the hidden field
// could leak whether an event_id exists in another group via the difference
// between missing_event and insufficient_privilege errors. We reject any
// submission missing a group_id the leader actually leads -- the RPC also
// normalizes those cases, but this client-side guard keeps the error
// surface tight.
function requireOwnedGroupId(
  raw: Record<string, unknown>,
  assignedGroupIds: string[]
): { ok: true; groupId: string } | { ok: false; error: string } {
  const value = rawGroupId(raw);
  if (!value) {
    return {
      ok: false,
      error: "group_id is required for leader calendar mutations.",
    };
  }
  if (!assignedGroupIds.includes(value)) {
    return { ok: false, error: CALENDAR_NOT_ASSIGNED };
  }
  return { ok: true, groupId: value };
}

// ----- leaderCreateCalendarEvent ------------------------------------------

// toRpcArgs key lists: the event RPC args are these payload fields,
// p_-prefixed, PLUS the deliberately-null inherited meeting times, which stay
// literal at the call sites (Phase 5A.6 correction: meeting time is always
// inherited from the group schedule; the calendar editor never sets a
// per-event time).
const CREATE_EVENT_ARG_KEYS = [
  "group_id",
  "event_date",
  "event_type",
  "status",
  "title",
  "description",
] as const;

const UPDATE_EVENT_ARG_KEYS = [
  "event_id",
  "event_date",
  "event_type",
  "status",
  "title",
  "description",
] as const;

const CREATE_EVENT_SPEC: LeaderWriteActionSpec<
  CalendarEventCreatePayload,
  { id: string }
> = {
  name: "leader.calendar.create_event",
  read: readFormPayload,
  validate: validateCalendarEventCreatePayload,
  // Defense-in-depth: the RPC also enforces auth_is_leader_of(group_id), but
  // rejecting locally avoids surfacing a generic insufficient_privilege
  // error to a leader who tampered with the form's hidden group_id field.
  guard: (actor, value) =>
    actor.assignedGroupIds.includes(value.group_id)
      ? null
      : {
          error: CALENDAR_NOT_ASSIGNED,
          code: "not_assigned",
          fields: { target_group_id: value.group_id },
        },
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  okFields: (value, id) => ({ event_type: value.event_type, new_event_id: id }),
  rpc: (client, value) =>
    leaderRpc(client, "leader_create_group_calendar_event", {
      p_start_time: null,
      p_end_time: null,
      ...toRpcArgs(value, CREATE_EVENT_ARG_KEYS),
    }),
  revalidate: (value) => leaderCalendarPaths(value.group_id),
  noDataError: "The calendar event was not created. Please try again.",
};

export async function leaderCreateCalendarEvent(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>
): Promise<ActionResult<{ id: string }>> {
  return runLeaderWriteAction(CREATE_EVENT_SPEC, prev, input);
}

// ----- leaderUpdateCalendarEvent ------------------------------------------

// The event-by-id actions guard ownership from the hidden group_id before
// validation, so the validated event_id never leaks across groups.
function ownershipGuard(
  actor: { assignedGroupIds: string[] },
  raw: Record<string, unknown>
) {
  const ownership = requireOwnedGroupId(raw, actor.assignedGroupIds);
  return ownership.ok
    ? ({ ok: true, fields: { target_group_id: ownership.groupId } } as const)
    : ({ ok: false, error: ownership.error, code: "not_assigned" } as const);
}

const UPDATE_EVENT_SPEC: LeaderWriteActionSpec<
  CalendarEventUpdatePayload,
  { id: string }
> = {
  name: "leader.calendar.update_event",
  read: readFormPayload,
  guardRaw: ownershipGuard,
  validate: validateCalendarEventUpdatePayload,
  fields: (_actor, value) => ({ target_event_id: value.event_id }),
  rpc: (client, value) =>
    leaderRpc(client, "leader_update_group_calendar_event", {
      p_start_time: null,
      p_end_time: null,
      ...toRpcArgs(value, UPDATE_EVENT_ARG_KEYS),
    }),
  revalidate: (_value, raw) => leaderCalendarPaths(rawGroupId(raw)),
  noDataError: "The calendar event was not updated. Please try again.",
};

export async function leaderUpdateCalendarEvent(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>
): Promise<ActionResult<{ id: string }>> {
  return runLeaderWriteAction(UPDATE_EVENT_SPEC, prev, input);
}

// ----- leaderArchiveCalendarEvent -----------------------------------------

const ARCHIVE_EVENT_SPEC: LeaderWriteActionSpec<
  CalendarEventArchivePayload,
  { id: string }
> = {
  name: "leader.calendar.archive_event",
  read: readFormPayload,
  guardRaw: ownershipGuard,
  validate: validateCalendarEventIdPayload,
  fields: (_actor, value) => ({ target_event_id: value.event_id }),
  rpc: (client, value) =>
    leaderRpc(client, "leader_archive_group_calendar_event", {
      p_event_id: value.event_id,
    }),
  revalidate: (_value, raw) => leaderCalendarPaths(rawGroupId(raw)),
  noDataError: "The calendar event was not archived. Please try again.",
};

export async function leaderArchiveCalendarEvent(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>
): Promise<ActionResult<{ id: string }>> {
  return runLeaderWriteAction(ARCHIVE_EVENT_SPEC, prev, input);
}

// ----- leaderRestoreCalendarEvent -----------------------------------------

const RESTORE_EVENT_SPEC: LeaderWriteActionSpec<
  CalendarEventArchivePayload,
  { id: string }
> = {
  name: "leader.calendar.restore_event",
  read: readFormPayload,
  guardRaw: ownershipGuard,
  validate: validateCalendarEventIdPayload,
  fields: (_actor, value) => ({ target_event_id: value.event_id }),
  rpc: (client, value) =>
    leaderRpc(client, "leader_restore_group_calendar_event", {
      p_event_id: value.event_id,
    }),
  revalidate: (_value, raw) => leaderCalendarPaths(rawGroupId(raw)),
  noDataError: "The calendar event was not restored. Please try again.",
};

export async function leaderRestoreCalendarEvent(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<Record<string, unknown>>
): Promise<ActionResult<{ id: string }>> {
  return runLeaderWriteAction(RESTORE_EVENT_SPEC, prev, input);
}
