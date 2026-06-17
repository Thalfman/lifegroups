"use client";

import { type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { PButton, type PButtonTone } from "@/components/pastoral/button";
import { P, fontSans, fontBody } from "@/lib/pastoral";

// A reusable, non-blocking confirmation dialog. It replaces the synchronous
// `window.confirm` gate: opening it paints immediately (the initiating click
// returns at once, so operator think-time no longer counts against that
// interaction's INP), while staying keyboard- and screen-reader-correct via
// Radix `AlertDialog`. The caller supplies its own opener as `trigger`; wiring
// it through `AlertDialogTrigger` hands Radix the trigger ref, so it both
// announces the control (aria-haspopup/expanded) and restores focus to it on
// close (Escape, Cancel, or confirm). The destructive action submits from the
// dialog's confirm button, not the initiating click.
export function ConfirmDialog({
  trigger,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmTone = "terra",
  onConfirm,
}: {
  // The opener control. Radix renders it via AlertDialogTrigger (asChild), so
  // it must forward props/ref to a real focusable element (PButton does).
  trigger: ReactNode;
  // Short accessible heading; defaults to the confirm label when omitted so a
  // dialog is never unlabelled.
  title?: string;
  // The body copy — the same text the flow used to pass to `window.confirm`.
  // Newlines are preserved so multi-paragraph confirmations read as written.
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: PButtonTone;
  // Fired when the operator confirms; Radix then closes the dialog. It runs
  // synchronously, so the submit it triggers fires before the close settles.
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogPortal>
        <AlertDialogOverlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(58, 42, 26, 0.45)",
            zIndex: 60,
          }}
        />
        <AlertDialogContent
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(460px, 92vw)",
            maxHeight: "92dvh",
            overflowY: "auto",
            background: P.bg,
            border: `1px solid ${P.line}`,
            borderRadius: 14,
            padding: 24,
            zIndex: 61,
            boxShadow: "0 18px 48px rgba(58, 42, 26, 0.22)",
            display: "grid",
            gap: 16,
          }}
        >
          <AlertDialogTitle
            style={{
              margin: 0,
              fontFamily: fontSans,
              fontSize: 16,
              fontWeight: 600,
              color: P.ink,
            }}
          >
            {title ?? confirmLabel}
          </AlertDialogTitle>
          <AlertDialogDescription
            style={{
              margin: 0,
              fontFamily: fontBody,
              fontSize: 14,
              lineHeight: 1.5,
              color: P.ink2,
              whiteSpace: "pre-line",
            }}
          >
            {message}
          </AlertDialogDescription>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 4,
            }}
          >
            <AlertDialogCancel asChild>
              <PButton type="button" tone="ghost" size="sm">
                {cancelLabel}
              </PButton>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <PButton
                type="button"
                tone={confirmTone}
                size="sm"
                onClick={onConfirm}
              >
                {confirmLabel}
              </PButton>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
