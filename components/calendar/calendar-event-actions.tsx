"use client";

import { useActionState, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { errorTextStyle } from "@/components/admin/forms/field-styles";
import { CalendarEventForm, type CalendarEventFormInitial } from "./calendar-event-form";
import { P, fontBody } from "@/lib/pastoral";
import type { GroupCalendarEventsRow } from "@/types/database";

type ActionResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };
type State = ActionResult<{ id: string }> | undefined;
type ServerAction = (prev: State, input: FormData) => Promise<State>;

export type CalendarActionSet = {
  update: ServerAction;
  archive: ServerAction;
  restore: ServerAction;
  cancel?: ServerAction; // optional shortcut wrapping update with status=cancelled
  markOff?: ServerAction; // optional shortcut wrapping update with status=off
};

// Row-level action cluster used by the leader and admin calendar pages.
// Renders an Edit button that toggles inline edit, plus Archive / Restore
// quick actions. Mark-OFF and Cancel quick toggles are handled inline by
// re-submitting the update action with adjusted status.
export function CalendarEventActions({
  event,
  groupId,
  actions,
  disabled = false,
}: {
  event: GroupCalendarEventsRow;
  groupId: string;
  actions: CalendarActionSet;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const archived = event.archived_at != null;

  if (disabled) {
    return null;
  }

  if (editing) {
    const initial: CalendarEventFormInitial = {
      eventId: event.id,
      eventDate: event.event_date,
      startTime: event.start_time ? event.start_time.slice(0, 5) : null,
      endTime: event.end_time ? event.end_time.slice(0, 5) : null,
      eventType: event.event_type,
      status: event.status,
      title: event.title,
      description: event.description,
    };
    return (
      <div
        style={{
          background: P.bgDeep,
          border: `1px solid ${P.line}`,
          borderRadius: 12,
          padding: "12px 14px",
          width: "100%",
          minWidth: 260,
          fontFamily: fontBody,
        }}
      >
        <CalendarEventForm
          action={actions.update}
          mode="update"
          groupId={groupId}
          initial={initial}
          submitLabel="Save event"
          successMessage="Event saved."
        />
        <div style={{ marginTop: 8 }}>
          <PButton type="button" tone="ghost" size="sm" onClick={() => setEditing(false)}>
            Done editing
          </PButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
      {archived ? (
        <RestoreButton event={event} groupId={groupId} action={actions.restore} />
      ) : (
        <>
          <PButton type="button" tone="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </PButton>
          {event.status === "scheduled" ? (
            <QuickStatusButton
              event={event}
              groupId={groupId}
              action={actions.update}
              targetStatus="off"
              label="Mark OFF"
            />
          ) : null}
          {event.status === "scheduled" ? (
            <QuickStatusButton
              event={event}
              groupId={groupId}
              action={actions.update}
              targetStatus="cancelled"
              label="Cancel"
            />
          ) : null}
          <ArchiveButton event={event} groupId={groupId} action={actions.archive} />
        </>
      )}
    </div>
  );
}

function ArchiveButton({
  event,
  groupId,
  action,
}: {
  event: GroupCalendarEventsRow;
  groupId: string;
  action: ServerAction;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, undefined);
  function confirmArchive(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        "Archive this calendar event? It will stay in the record and can be restored later.",
      )
    ) {
      e.preventDefault();
    }
  }
  return (
    <form action={formAction} onSubmit={confirmArchive} style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <input type="hidden" name="event_id" value={event.id} />
      <input type="hidden" name="group_id" value={groupId} />
      <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
        {pending ? "Archiving…" : "Archive"}
      </PButton>
      {state && !state.ok ? (
        <p style={{ ...errorTextStyle, maxWidth: 220, fontSize: 12 }}>{state.errors[0]}</p>
      ) : null}
    </form>
  );
}

function RestoreButton({
  event,
  groupId,
  action,
}: {
  event: GroupCalendarEventsRow;
  groupId: string;
  action: ServerAction;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, undefined);
  return (
    <form action={formAction} style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <input type="hidden" name="event_id" value={event.id} />
      <input type="hidden" name="group_id" value={groupId} />
      <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
        {pending ? "Restoring…" : "Restore"}
      </PButton>
      {state && !state.ok ? (
        <p style={{ ...errorTextStyle, maxWidth: 220, fontSize: 12 }}>{state.errors[0]}</p>
      ) : null}
    </form>
  );
}

// Quick-toggles status to off/cancelled via the update action. Sends the
// same payload as the edit form so server-side coercion sets event_type
// to match. Postgres `time` columns serialize as HH:mm:ss while the
// shared validator only accepts HH:mm, so trim seconds before
// submitting -- otherwise Mark OFF / Cancel fails for timed events.
function toHhMm(value: string | null): string {
  if (!value) return "";
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function QuickStatusButton({
  event,
  groupId,
  action,
  targetStatus,
  label,
}: {
  event: GroupCalendarEventsRow;
  groupId: string;
  action: ServerAction;
  targetStatus: "off" | "cancelled";
  label: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, undefined);
  return (
    <form
      action={formAction}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}
    >
      <input type="hidden" name="event_id" value={event.id} />
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="event_date" value={event.event_date} />
      <input type="hidden" name="start_time" value={toHhMm(event.start_time)} />
      <input type="hidden" name="end_time" value={toHhMm(event.end_time)} />
      <input type="hidden" name="status" value={targetStatus} />
      <input type="hidden" name="event_type" value={targetStatus} />
      <input type="hidden" name="title" value={event.title ?? ""} />
      <input type="hidden" name="description" value={event.description ?? ""} />
      <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
        {pending ? "Saving…" : label}
      </PButton>
      {state && !state.ok ? (
        <p style={{ ...errorTextStyle, maxWidth: 220, fontSize: 12 }}>{state.errors[0]}</p>
      ) : null}
    </form>
  );
}
