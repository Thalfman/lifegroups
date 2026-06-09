"use client";

import {
  useEffect,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { PButton, type PButtonTone } from "@/components/pastoral/button";
import {
  confirmActionButtonView,
  gateSubmitOnConfirm,
} from "@/lib/forms/confirm-action-view";
import {
  useActionForm,
  FormStatusLine,
  type ServerAction,
} from "./action-form";

// The one deep confirm-action module (#489). Six admin button flows — Archive
// group, Restore group, Deactivate profile, Deactivate member, Clear group
// metric overrides, Reset metric defaults — used to re-wire the same
// lifecycle by hand: useActionForm → window.confirm gate → hidden fields →
// FormStatus, plus pending/aria handling. This module owns that lifecycle
// once; the six buttons are declarative configs of it (action + confirmation
// copy + hidden fields + labels). The pure decisions live in
// lib/forms/confirm-action-view.ts so the lifecycle is unit-tested once.

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
  // Passed verbatim to window.confirm before the submit is allowed through.
  confirmMessage: string;
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

  function confirmSubmit(e: FormEvent<HTMLFormElement>) {
    gateSubmitOnConfirm(window.confirm(confirmMessage), e);
  }

  const containerStyle: CSSProperties = {
    display: "grid",
    gap,
    ...(alignEnd ? { justifyItems: "end" } : {}),
  };

  return (
    <div style={containerStyle}>
      <form action={formAction} onSubmit={confirmSubmit}>
        {hiddenFields.map((field) => (
          <input
            key={field.name}
            type="hidden"
            name={field.name}
            value={field.value}
          />
        ))}
        <PButton
          type="submit"
          tone={tone}
          size="sm"
          disabled={view.disabled}
          aria-label={ariaLabel}
        >
          {view.label}
        </PButton>
      </form>
      {helperText}
      <FormStatusLine view={view.status} />
    </div>
  );
}
