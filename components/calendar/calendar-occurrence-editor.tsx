"use client";

import {
  Fragment,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { PButton } from "@/components/pastoral/button";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import {
  EVENT_STATUS_OPTIONS,
  EVENT_TYPE_OPTIONS,
} from "@/lib/calendar/payload";
import { dateLabel, formatClock } from "@/lib/calendar/occurrences";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
} from "@/types/enums";

type ActionResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };
type State = ActionResult<{ id: string }> | undefined;
type ServerAction = (prev: State, input: FormData) => Promise<State>;

export type CalendarOccurrenceEditorActions = {
  create: ServerAction;
  update: ServerAction;
  archive: ServerAction;
};

export type CalendarOccurrenceEditorOccurrence = {
  date: string;
  meetingTime: string | null;
  eventType: GroupCalendarEventType;
  status: GroupCalendarEventStatus;
  title: string | null;
  description: string | null;
  // null = pure default (no saved row yet); non-null = saved override.
  overrideId: string | null;
  // Whether the date is a cadence-driven meeting occurrence.
  isMeetingOccurrence: boolean;
};

// Renders an inline button that opens a modal editor for the given
// occurrence. The button is positioned absolutely over the parent cell
// or pill, picking up its full clickable area -- callers wrap it with
// `position: relative` so the editor opens from anywhere on the cell.
export function CalendarOccurrenceEditor({
  groupId,
  groupMeetingTime,
  occurrence,
  actions,
  triggerLabel,
  triggerStyle,
  triggerClassName,
  canEdit,
  disabledReason,
  showClock,
  previewNotice,
}: {
  groupId: string;
  groupMeetingTime: string | null;
  occurrence: CalendarOccurrenceEditorOccurrence;
  actions: CalendarOccurrenceEditorActions;
  triggerLabel: React.ReactNode;
  triggerStyle?: React.CSSProperties;
  triggerClassName?: string;
  canEdit: boolean;
  disabledReason?: string;
  showClock?: boolean;
  previewNotice?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!canEdit) {
    // Render a non-interactive view of the pill/cell content. Callers
    // can still display the occurrence, just without an edit affordance.
    return (
      <div
        title={disabledReason}
        style={{
          ...triggerStyle,
          cursor: "default",
          opacity: 0.7,
        }}
        className={triggerClassName}
      >
        {triggerLabel}
      </div>
    );
  }

  return (
    <Fragment>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          ...triggerStyle,
          background: triggerStyle?.background ?? "transparent",
          border: triggerStyle?.border ?? "none",
          cursor: "pointer",
          textAlign: "left",
          padding: triggerStyle?.padding ?? 0,
          font: "inherit",
          color: triggerStyle?.color ?? "inherit",
        }}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>
      {open ? (
        <EditorModal
          open={open}
          onClose={() => setOpen(false)}
          groupId={groupId}
          groupMeetingTime={groupMeetingTime}
          occurrence={occurrence}
          actions={actions}
          showClock={showClock}
          previewNotice={previewNotice}
        />
      ) : null}
    </Fragment>
  );
}

function EditorModal({
  open,
  onClose,
  groupId,
  groupMeetingTime,
  occurrence,
  actions,
  showClock,
  previewNotice,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupMeetingTime: string | null;
  occurrence: CalendarOccurrenceEditorOccurrence;
  actions: CalendarOccurrenceEditorActions;
  showClock?: boolean;
  previewNotice?: string;
}) {
  const idRoot = useId();
  const statusId = `${idRoot}-status`;
  const typeId = `${idRoot}-type`;
  const titleId = `${idRoot}-title`;
  const descriptionId = `${idRoot}-description`;
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<GroupCalendarEventStatus>(occurrence.status);

  // Pick the action based on whether an override already exists.
  const saveAction = occurrence.overrideId ? actions.update : actions.create;
  const [saveState, saveFormAction, savePending] = useActionState<State, FormData>(
    saveAction,
    undefined,
  );
  const [clearState, clearFormAction, clearPending] = useActionState<State, FormData>(
    actions.archive,
    undefined,
  );

  // Close the modal as soon as a save or clear succeeds. Without this,
  // the next time the user opens the editor it would still show the
  // success banner from the previous interaction.
  useEffect(() => {
    if (saveState?.ok) onClose();
  }, [saveState, onClose]);
  useEffect(() => {
    if (clearState?.ok) onClose();
  }, [clearState, onClose]);

  const showEventTypeSelect = status === "scheduled";
  const lockedEventType: GroupCalendarEventType =
    status === "off" ? "off" : status === "cancelled" ? "cancelled" : occurrence.eventType;

  const clockLabel = formatClock(groupMeetingTime);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogPortal>
        <DialogOverlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(58, 42, 26, 0.45)",
            zIndex: 60,
          }}
        />
        <DialogContent
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: P.bg,
            border: `1px solid ${P.line}`,
            borderRadius: 14,
            padding: 0,
            zIndex: 61,
            width: "min(520px, calc(100vw - 32px))",
            maxHeight: "calc(100vh - 32px)",
            overflowY: "auto",
            boxShadow: "0 18px 48px rgba(58, 42, 26, 0.2)",
          }}
        >
          <header
            style={{
              padding: "18px 22px 6px",
              display: "grid",
              gap: 4,
            }}
          >
            <DialogTitle
              style={{
                fontFamily: fontSans,
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: P.ink3,
                fontWeight: 600,
                margin: 0,
              }}
            >
              {occurrence.isMeetingOccurrence
                ? "Edit meeting occurrence"
                : "Edit special occurrence"}
            </DialogTitle>
            <DialogDescription
              style={{
                fontFamily: fontBody,
                fontSize: 18,
                color: P.ink,
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {dateLabel(occurrence.date)}
              {showClock && clockLabel ? ` · ${clockLabel}` : null}
            </DialogDescription>
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 12,
                color: P.ink2,
                margin: "4px 0 0",
                lineHeight: 1.45,
              }}
            >
              Meeting time is inherited from the group schedule. To change it, edit the group.
            </p>
          </header>

          <form
            ref={formRef}
            action={saveFormAction}
            style={{ display: "grid", gap: 12, padding: "12px 22px 18px" }}
          >
            <input type="hidden" name="group_id" value={groupId} />
            <input type="hidden" name="event_date" value={occurrence.date} />
            {occurrence.overrideId ? (
              <input type="hidden" name="event_id" value={occurrence.overrideId} />
            ) : null}
            {!showEventTypeSelect ? (
              <input type="hidden" name="event_type" value={lockedEventType} />
            ) : null}

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
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
                    Gathering type
                  </label>
                  <select
                    id={typeId}
                    name="event_type"
                    defaultValue={
                      occurrence.eventType === "off" || occurrence.eventType === "cancelled"
                        ? "study"
                        : occurrence.eventType
                    }
                    style={fieldSelectStyle}
                  >
                    {EVENT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div />
              )}
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
                defaultValue={occurrence.title ?? ""}
                placeholder={
                  showEventTypeSelect ? "e.g. Week 3 of the rotation" : "Optional reason"
                }
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
                defaultValue={occurrence.description ?? ""}
                style={{ ...fieldInputStyle, lineHeight: 1.5, resize: "vertical" }}
              />
            </div>

            {saveState && !saveState.ok ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                {saveState.errors.map((msg, idx) => (
                  <li key={idx} style={errorTextStyle}>
                    {msg}
                  </li>
                ))}
              </ul>
            ) : null}
            {previewNotice ? (
              <p
                style={{
                  fontFamily: fontBody,
                  fontSize: 12,
                  color: P.ink2,
                  background: P.surface,
                  border: `1px dashed ${P.line}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  margin: 0,
                }}
              >
                {previewNotice}
              </p>
            ) : null}

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 4,
              }}
            >
              <DialogClose asChild>
                <PButton type="button" tone="ghost" size="md">
                  Cancel
                </PButton>
              </DialogClose>
              <PButton type="submit" tone="terra" size="md" disabled={savePending}>
                {savePending ? "Saving…" : "Save changes"}
              </PButton>
            </div>
          </form>

          {occurrence.overrideId ? (
            <ClearOverrideRow
              groupId={groupId}
              eventId={occurrence.overrideId}
              action={clearFormAction}
              pending={clearPending}
              errors={clearState && !clearState.ok ? clearState.errors : []}
            />
          ) : null}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

function ClearOverrideRow({
  groupId,
  eventId,
  action,
  pending,
  errors,
}: {
  groupId: string;
  eventId: string;
  action: (formData: FormData) => void;
  pending: boolean;
  errors: string[];
}) {
  return (
    <div
      style={{
        padding: "12px 22px 18px",
        borderTop: `1px solid ${P.line}`,
        display: "grid",
        gap: 8,
      }}
    >
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.45,
        }}
      >
        Reverting this date drops the override and shows the default occurrence from the group schedule again.
      </p>
      {errors.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
          {errors.map((msg, idx) => (
            <li key={idx} style={errorTextStyle}>
              {msg}
            </li>
          ))}
        </ul>
      ) : null}
      <form action={action} style={{ display: "flex", justifyContent: "flex-end" }}>
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="group_id" value={groupId} />
        <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
          {pending ? "Clearing…" : "Clear override"}
        </PButton>
      </form>
    </div>
  );
}
