"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PButton, type PButtonTone } from "@/components/pastoral/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  confirmActionButtonView,
  confirmActionSubmitMode,
} from "@/lib/forms/confirm-action-view";
import {
  useActionForm,
  FormStatusLine,
  type ServerAction,
} from "./action-form";

// The one deep confirm-action module (#489, widened by #494). Admin button
// flows — Archive group, Restore group, Deactivate profile, Deactivate
// member, Clear group metric overrides, Reset metric defaults, Archive
// prospect, Archive/Restore over-shepherd, Archive care follow-up, Delete
// unused category — used to re-wire the same lifecycle by hand:
// useActionForm → confirm gate → hidden fields → FormStatus, plus
// pending/aria handling. This module owns that lifecycle once; the buttons
// are declarative configs of it (action + confirmation copy + hidden fields
// + labels). The pure decisions live in lib/forms/confirm-action-view.ts so
// the lifecycle is unit-tested once.
//
// The confirm gate is a non-blocking Radix `AlertDialog` (#664), not the old
// synchronous `window.confirm`: opening it paints immediately, so operator
// think-time stops being attributed to the initiating click's INP. The action
// submits from the dialog's confirm button.

// A hidden input serialized into the form, e.g. { name: "group_id", value: id }.
export type ConfirmActionHiddenField = { name: string; value: string };

export function ConfirmActionButton<T>({
  action,
  confirmMessage,
  hiddenFields = [],
  idleLabel,
  pendingLabel,
  tone,
  ariaLabel,
  successText,
  gap = 6,
  alignEnd = true,
  helperText,
  onSuccess,
  onPendingChange,
}: {
  action: ServerAction<T>;
  // Shown verbatim in the confirmation dialog before the submit is allowed
  // through. Null means this direction needs no dialog (e.g. restoring an
  // archived over-shepherd) — the submit goes straight through.
  confirmMessage: string | null;
  hiddenFields?: readonly ConfirmActionHiddenField[];
  idleLabel: string;
  pendingLabel: string;
  tone: PButtonTone;
  // Record-context accessible name (e.g. "Archive {group}") so repeated
  // controls in a list/table stay uniquely named for screen readers. Falls
  // back to the visible label when omitted.
  ariaLabel?: string;
  // Success line under the button; omit for error-only flows.
  successText?: string;
  // Container layout: every flow is a tight grid; all but the Settings
  // reset-defaults card right-align the button column.
  gap?: number;
  alignEnd?: boolean;
  // Optional static copy rendered between the form and the status line.
  helperText?: ReactNode;
  // Fired once the action lands ok — e.g. the groups drawer closes on archive.
  onSuccess?: () => void;
  // Mirrors the in-flight state to the host — e.g. the drawer stays open
  // while an archive is pending.
  onPendingChange?: (pending: boolean) => void;
}) {
  const { state, formAction, pending } = useActionForm<T>(action);
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (state?.ok) onSuccess?.();
  }, [state, onSuccess]);

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const view = confirmActionButtonView({
    pending,
    idleLabel,
    pendingLabel,
    state,
    successText,
  });

  // A `null` message submits straight through (no dialog); otherwise the
  // visible button only opens the dialog, and the dialog's confirm button
  // submits the form.
  const gated = confirmActionSubmitMode(confirmMessage) === "confirm";

  return (
    // `gap` is a caller-supplied number (component API), so it stays a dynamic
    // inline style; the rest of the container is utility classes.
    <div
      className={cn("grid", alignEnd && "justify-items-end")}
      style={{ gap }}
    >
      <form action={formAction} ref={formRef}>
        {hiddenFields.map((field) => (
          <input
            key={field.name}
            type="hidden"
            name={field.name}
            value={field.value}
          />
        ))}
        <PButton
          type={gated ? "button" : "submit"}
          tone={tone}
          size="sm"
          disabled={view.disabled}
          aria-label={ariaLabel}
          onClick={gated ? () => setConfirmOpen(true) : undefined}
        >
          {view.label}
        </PButton>
      </form>
      {gated && confirmMessage !== null && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={idleLabel}
          message={confirmMessage}
          confirmLabel={idleLabel}
          confirmTone={tone}
          onConfirm={() => formRef.current?.requestSubmit()}
        />
      )}
      {helperText}
      <FormStatusLine view={view.status} />
    </div>
  );
}
