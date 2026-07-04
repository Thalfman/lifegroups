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
import {
  fieldInputClassName,
  fieldLabelClassName,
  fieldSelectClassName,
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
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/shared/action-result";
import { Button } from "@/components/ui/button";
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
        className={cn(triggerClassName, "cursor-default")}
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
        className={cn(
          "cursor-pointer border-0 bg-transparent p-0 text-left text-inherit [font:inherit]",
          triggerClassName
        )}
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

// The modal's title/date/inheritance-note band. Split out of EditorModal so the
// modal body reads as structure (header · field grid · form actions) rather than
// one ~330-line block.
function EditorHeader({
  occurrence,
  showClock,
  clockLabel,
}: {
  occurrence: CalendarOccurrenceEditorOccurrence;
  showClock?: boolean;
  clockLabel: ReturnType<typeof formatClock>;
}) {
  return (
    <header className="grid gap-1 px-[22px] pb-1.5 pt-[18px]">
      <DialogTitle className="m-0 font-sans text-2xs font-semibold uppercase tracking-[1.5px] text-ink3">
        {occurrence.isMeetingOccurrence
          ? "Edit meeting occurrence"
          : "Edit special occurrence"}
      </DialogTitle>
      <DialogDescription className="m-0 font-sans text-[18px] leading-[1.3] text-ink">
        {dateLabel(occurrence.date)}
        {showClock && clockLabel ? ` · ${clockLabel}` : null}
      </DialogDescription>
      <p className="m-0 mt-1 font-sans text-xs leading-[1.45] text-ink2">
        Meeting time is inherited from the group schedule. To change it, edit
        the group.
      </p>
    </header>
  );
}

// The status + gathering-type two-up. Gathering type only shows when the
// occurrence is "scheduled"; otherwise the empty cell keeps the grid balanced.
function EditorStatusTypeFields({
  statusId,
  typeId,
  status,
  onStatusChange,
  showEventTypeSelect,
  occurrence,
}: {
  statusId: string;
  typeId: string;
  status: GroupCalendarEventStatus;
  onStatusChange: (next: GroupCalendarEventStatus) => void;
  showEventTypeSelect: boolean;
  occurrence: CalendarOccurrenceEditorOccurrence;
}) {
  return (
    <div className="lg-m-form-2up grid grid-cols-2 gap-3">
      <div>
        <label htmlFor={statusId} className={fieldLabelClassName}>
          Status
        </label>
        <select
          id={statusId}
          name="status"
          value={status}
          onChange={(e) =>
            onStatusChange(e.target.value as GroupCalendarEventStatus)
          }
          className={fieldSelectClassName}
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
          <label htmlFor={typeId} className={fieldLabelClassName}>
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
            className={fieldSelectClassName}
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
        <DialogOverlay className="fixed inset-0 z-overlay bg-[rgba(58,42,26,0.45)]" />
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
          className="fixed left-1/2 top-1/2 z-drawer max-h-[calc(100vh-32px)] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-bg p-0 shadow-[0_18px_48px_rgba(58,42,26,0.2)]"
        >
          <EditorHeader
            occurrence={occurrence}
            showClock={showClock}
            clockLabel={clockLabel}
          />

          <form
            ref={formRef}
            action={saveFormAction}
            className="grid gap-3 px-[22px] pb-[18px] pt-3"
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

            <EditorStatusTypeFields
              statusId={statusId}
              typeId={typeId}
              status={status}
              onStatusChange={setStatus}
              showEventTypeSelect={showEventTypeSelect}
              occurrence={occurrence}
            />

            <div>
              <label htmlFor={titleId} className={fieldLabelClassName}>
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
                className={`lg-m-input ${fieldInputClassName}`}
              />
            </div>

            <div>
              <label htmlFor={descriptionId} className={fieldLabelClassName}>
                Description (optional)
              </label>
              <textarea
                id={descriptionId}
                name="description"
                maxLength={1000}
                rows={3}
                defaultValue={occurrence.description ?? ""}
                className={`lg-m-input ${fieldInputClassName} resize-y leading-normal`}
              />
            </div>

            <FormStatus state={saveState} />
            {previewNotice ? (
              <p className="m-0 rounded-[8px] border border-dashed border-line bg-surface px-3 py-2 font-sans text-xs text-ink2">
                {previewNotice}
              </p>
            ) : null}

            <div className="mt-1 flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="md">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={savePending}
              >
                {savePending ? "Saving…" : "Save changes"}
              </Button>
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
    <div className="grid gap-2 border-t border-line px-[22px] pb-[18px] pt-3">
      <p className="m-0 font-sans text-xs leading-[1.45] text-ink2">
        Reverting this date drops the override and shows the default occurrence
        from the group schedule again.
      </p>
      <FormStatus state={state} />
      <form action={action} className="flex justify-end">
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="group_id" value={groupId} />
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          {pending ? "Clearing…" : "Clear override"}
        </Button>
      </form>
    </div>
  );
}
