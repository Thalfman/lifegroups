"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  formGridStyle,
  formNoteStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import {
  EVENT_STATUS_OPTIONS,
  EVENT_TYPE_OPTIONS,
} from "@/lib/calendar/payload";
import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
} from "@/types/enums";

type ActionResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };
type State = ActionResult<{ id: string }> | undefined;
type ServerAction = (prev: State, input: FormData) => Promise<State>;

export type CalendarEventFormInitial = {
  eventId?: string;
  eventDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:mm
  endTime: string | null; // HH:mm
  eventType: GroupCalendarEventType;
  status: GroupCalendarEventStatus;
  title: string | null;
  description: string | null;
};

const EMPTY_INITIAL: CalendarEventFormInitial = {
  eventDate: "",
  startTime: null,
  endTime: null,
  eventType: "study",
  status: "scheduled",
  title: null,
  description: null,
};

export function CalendarEventForm({
  action,
  mode,
  groupId,
  initial,
  submitLabel,
  successMessage,
}: {
  action: ServerAction;
  mode: "create" | "update";
  groupId: string;
  initial?: CalendarEventFormInitial;
  submitLabel?: string;
  successMessage?: string;
}) {
  const init = initial ?? EMPTY_INITIAL;
  // Both the page-level create form and any number of inline edit
  // forms can mount simultaneously. Hard-coded ids would produce
  // duplicate `event-date` / `event-status` ids and break label-input
  // targeting (and focus management for keyboard / a11y).
  const fieldId = useId();
  const dateId = `${fieldId}-date`;
  const statusId = `${fieldId}-status`;
  const typeId = `${fieldId}-type`;
  const startId = `${fieldId}-start`;
  const endId = `${fieldId}-end`;
  const titleId = `${fieldId}-title`;
  const descriptionId = `${fieldId}-description`;
  const [state, formAction, pending] = useActionState<State, FormData>(
    action,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<GroupCalendarEventStatus>(init.status);

  useEffect(() => {
    if (state?.ok && mode === "create") {
      formRef.current?.reset();
      setStatus("scheduled");
    }
  }, [state, mode]);

  // For OFF / cancelled status, hide the event_type select and send the
  // matching event_type via hidden input. The server coerces, but this
  // keeps the UI honest about the relationship.
  const showEventTypeSelect = status === "scheduled";
  const lockedEventType: GroupCalendarEventType =
    status === "off" ? "off" : status === "cancelled" ? "cancelled" : init.eventType;

  return (
    <form ref={formRef} action={formAction} style={{ display: "grid", gap: 12 }}>
      <p style={formNoteStyle}>
        {mode === "create"
          ? "Add a calendar event for this group. Pick the date, choose Scheduled / OFF / Cancelled, and add a title if it helps the group remember."
          : "Update this calendar event. Marking OFF or Cancelled will suppress check-in due for that week."}
      </p>

      <input type="hidden" name="group_id" value={groupId} />
      {mode === "update" && init.eventId ? (
        <input type="hidden" name="event_id" value={init.eventId} />
      ) : null}
      {!showEventTypeSelect ? (
        <input type="hidden" name="event_type" value={lockedEventType} />
      ) : null}

      <div style={formGridStyle}>
        <div>
          <label htmlFor={dateId} style={fieldLabelStyle}>
            Date
          </label>
          <input
            id={dateId}
            name="event_date"
            type="date"
            required
            defaultValue={init.eventDate}
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor={statusId} style={fieldLabelStyle}>
            Status
          </label>
          <select
            id={statusId}
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as GroupCalendarEventStatus)}
            style={fieldSelectStyle}
          >
            {EVENT_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {showEventTypeSelect ? (
          <div>
            <label htmlFor={typeId} style={fieldLabelStyle}>
              Event type
            </label>
            <select
              id={typeId}
              name="event_type"
              defaultValue={init.eventType === "off" || init.eventType === "cancelled" ? "study" : init.eventType}
              style={fieldSelectStyle}
            >
              {EVENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label htmlFor={startId} style={fieldLabelStyle}>
            Start time (optional)
          </label>
          <input
            id={startId}
            name="start_time"
            type="time"
            defaultValue={init.startTime ?? ""}
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor={endId} style={fieldLabelStyle}>
            End time (optional)
          </label>
          <input
            id={endId}
            name="end_time"
            type="time"
            defaultValue={init.endTime ?? ""}
            style={fieldInputStyle}
          />
        </div>
      </div>

      <div>
        <label htmlFor={titleId} style={fieldLabelStyle}>
          Title (optional)
        </label>
        <input
          id={titleId}
          name="title"
          type="text"
          maxLength={200}
          defaultValue={init.title ?? ""}
          placeholder={showEventTypeSelect ? "e.g. Men’s Transformation: week 3" : "Optional reason or note"}
          style={fieldInputStyle}
        />
      </div>

      <div>
        <label htmlFor={descriptionId} style={fieldLabelStyle}>
          Description (optional)
        </label>
        <textarea
          id={descriptionId}
          name="description"
          maxLength={1000}
          rows={3}
          defaultValue={init.description ?? ""}
          style={{ ...fieldInputStyle, lineHeight: 1.5, resize: "vertical" }}
        />
      </div>

      {state && !state.ok ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
          {state.errors.map((msg, idx) => (
            <li key={idx} style={errorTextStyle}>{msg}</li>
          ))}
        </ul>
      ) : null}
      {state?.ok ? (
        <p style={successTextStyle}>{successMessage ?? "Saved."}</p>
      ) : null}

      <div>
        <PButton type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel ?? (mode === "create" ? "Add event" : "Save changes")}
        </PButton>
      </div>
    </form>
  );
}
