"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
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
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  EVENT_STATUS_OPTIONS,
  EVENT_TYPE_OPTIONS,
} from "@/lib/calendar/payload";
import { dateLabel, formatClock } from "@/lib/calendar/occurrences";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { ActionResult } from "@/lib/shared/action-result";
import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
} from "@/types/enums";

type ServerAction = (
  prev: ActionResult<{ id: string }> | undefined,
  input: FormData
) => Promise<ActionResult<{ id: string }>>;

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
  triggerAriaLabel,
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
  // Explicit, meaningful accessible name for the trigger button. Without it
  // the button's name is the concatenated child text (day # + "Today" + type
  // + clock + status + "Special"), which reads as a meaningless run-on to a
  // screen reader. Callers build a summary like "Edit Oct 14 — Study, 6:30p,
  // Scheduled" or "Add event on Oct 14" and pass it here (#322).
  triggerAriaLabel?: string;
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
    // No opacity wash — it would floor the text below AA contrast; the
    // missing pointer affordance + title carry the disabled state.
    return (
      <div
        title={disabledReason}
        style={{
          ...triggerStyle,
          cursor: "default",
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
        aria-label={triggerAriaLabel}
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
  // The control that had focus when the editor opened, so we return focus to it
  // on close. This modal opens from a programmatic button (not a DialogTrigger)
  // and is conditionally mounted, so Radix has no trigger to auto-restore to —
  // mirror the EditingSurface pattern and own the restore ourselves.
  const openerRef = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState<GroupCalendarEventStatus>(
    occurrence.status
  );

  // Pick the action based on whether an override already exists.
  const saveAction = occurrence.overrideId ? actions.update : actions.create;
  const {
    state: saveState,
    formAction: saveFormAction,
    pending: savePending,
  } = useActionForm<{ id: string }>(saveAction);
  const {
    state: clearState,
    formAction: clearFormAction,
    pending: clearPending,
  } = useActionForm<{ id: string }>(actions.archive);

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
    status === "off"
      ? "off"
      : status === "cancelled"
        ? "cancelled"
        : occurrence.eventType;

  const clockLabel = formatClock(groupMeetingTime);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
    >
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
          // Capture the opener before Radix moves focus inward, then restore to
          // it on close (Radix's default has no trigger to return to here).
          onOpenAutoFocus={() => {
            openerRef.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            const opener = openerRef.current;
            if (opener && document.contains(opener)) {
              event.preventDefault();
              opener.focus();
            }
          }}
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
              Meeting time is inherited from the group schedule. To change it,
              edit the group.
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
              <input
                type="hidden"
                name="event_id"
                value={occurrence.overrideId}
              />
            ) : null}
            {!showEventTypeSelect ? (
              <input type="hidden" name="event_type" value={lockedEventType} />
            ) : null}

            <div
              className="lg-m-form-2up"
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "1fr 1fr",
              }}
            >
              <div>
                <label htmlFor={statusId} style={fieldLabelStyle}>
                  Status
                </label>
                <select
                  id={statusId}
                  name="status"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as GroupCalendarEventStatus)
                  }
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
                      occurrence.eventType === "off" ||
                      occurrence.eventType === "cancelled"
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
                  showEventTypeSelect
                    ? "e.g. Week 3 of the rotation"
                    : "Optional reason"
                }
                className="lg-m-input"
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
                className="lg-m-input"
                style={{
                  ...fieldInputStyle,
                  lineHeight: 1.5,
                  resize: "vertical",
                }}
              />
            </div>

            <FormStatus state={saveState} />
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
              <PButton
                type="submit"
                tone="terra"
                size="md"
                disabled={savePending}
              >
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
              state={clearState}
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
  state,
}: {
  groupId: string;
  eventId: string;
  action: (formData: FormData) => void;
  pending: boolean;
  state: ActionResult<{ id: string }> | undefined;
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
        Reverting this date drops the override and shows the default occurrence
        from the group schedule again.
      </p>
      <FormStatus state={state} />
      <form
        action={action}
        style={{ display: "flex", justifyContent: "flex-end" }}
      >
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="group_id" value={groupId} />
        <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
          {pending ? "Clearing…" : "Clear override"}
        </PButton>
      </form>
    </div>
  );
}
