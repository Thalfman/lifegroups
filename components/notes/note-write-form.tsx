"use client";

import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  useActionForm,
  FormStatus,
  type ServerAction,
} from "@/components/admin/forms/action-form";
import {
  fieldInputClassName,
  fieldLabelClassName,
  formNoteClassName,
} from "@/components/admin/forms/field-styles";
import { cn } from "@/lib/utils";

// The Care Note surface kit's write half (ADR 0036). The Ministry-Admin and
// Shepherd tiers had each hand-rolled the same form — privacy lede, labeled
// 4000-char textarea, pending-aware submit, FormStatus — around the shared
// useActionForm lifecycle; this module owns that markup once and the tiers
// configure copy, ids, and the hidden scope field. The Over-Shepherd broad
// note (log-broad-note-form.tsx) deliberately stays outside: it is a
// different entity with a different field contract (`note`, its own length
// cap, no care/prayer kind).
export function NoteWriteForm({
  action,
  label,
  idPrefix,
  placeholder,
  privacyNote,
  hiddenFields,
  submitContextName,
  onSaved,
  onDirty,
  onCancel,
  onPendingChange,
}: {
  action: ServerAction<{ id: string }>;
  // The record noun ("Care note" / "Prayer request") — drives the field
  // label, the submit label, and the saved confirmation.
  label: string;
  // Callers own id uniqueness (#776 Phase 1 / #785): when the form repeats
  // per subject (the Care accordion) or is mounted in both a panel and a
  // contextual drawer at once, the prefix must carry the subject and an
  // optional namespace so label/textarea ids never collide.
  idPrefix: string;
  placeholder: string;
  privacyNote: ReactNode;
  hiddenFields: Readonly<Record<string, string>>;
  // When the form repeats across records, the submit's accessible name must
  // carry record context (Admin Interaction Model req 4). Starts with the
  // visible label (axe label-in-name), then adds the subject.
  submitContextName?: string;
  // Optional drawer wiring (#776 Phase 1): `onSaved` closes + refreshes,
  // `onDirty` lets the drawer warn before discarding, `onPendingChange`
  // blocks dismissal mid-write, and `onCancel` renders a Cancel control.
  // Inline usages pass none.
  onSaved?: () => void;
  onDirty?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    action,
    { resetOnSuccess: true }
  );

  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const submitLabel = `Add ${label.toLowerCase()}`;

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={onDirty}
      className="grid gap-3"
    >
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p className={formNoteClassName}>{privacyNote}</p>
      <div>
        <label htmlFor={`${idPrefix}-body`} className={fieldLabelClassName}>
          {label} (max 4000 chars)
        </label>
        <textarea
          id={`${idPrefix}-body`}
          name="body"
          rows={4}
          required
          maxLength={4000}
          className={cn(fieldInputClassName, "min-h-24 resize-y")}
          placeholder={placeholder}
        />
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={pending}
          aria-label={
            submitContextName
              ? `${submitLabel} for ${submitContextName}`
              : undefined
          }
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      <FormStatus state={state} successText={`${label} saved.`} />
    </form>
  );
}
