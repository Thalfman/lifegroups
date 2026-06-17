"use client";

import { useRef, type ReactNode } from "react";
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
// Radix `AlertDialog`. It opens in one of two modes:
//
//   - Trigger mode (default): pass `trigger`, the opener control. Radix renders
//     it via `AlertDialogTrigger` (asChild) — it must forward props/ref to a
//     real focusable element (PButton does) — and owns open/close plus focus
//     restore to it on dismissal. Used by confirm-then-submit button flows.
//   - Controlled mode: pass `open` + `onOpenChange` and omit `trigger`. The host
//     raises the dialog programmatically — used by discard-on-close flows, where
//     the confirmation is triggered by Escape / overlay / × / Cancel on a drawer
//     rather than a dedicated button. Radix restores focus to whatever was
//     focused before it opened (the drawer control the user came from).
//
// The destructive action submits from the dialog's confirm button, not the
// initiating interaction.
export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmTone = "terra",
  onConfirm,
}: {
  // The opener control (trigger mode). Omit it for controlled mode.
  trigger?: ReactNode;
  // Controlled open state. Provide with `onOpenChange` to drive the dialog
  // programmatically; leave undefined to let the `trigger` own open state.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  // In trigger mode Radix restores focus to the trigger on close. In controlled
  // mode there is no trigger ref, so Radix would drop focus to <body>; capture
  // the control that was focused when the dialog opened (the drawer control the
  // dismissal came from) and restore it ourselves — the EditingSurface pattern.
  const controlled = trigger == null;
  const openerRef = useRef<HTMLElement | null>(null);

  return (
    // `open`/`onOpenChange` undefined leaves Radix uncontrolled, so the trigger
    // drives it; supplied, the host drives it (no trigger needed).
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      ) : null}
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
          // Controlled mode only: capture the opener before Radix moves focus
          // inward, then restore to it on close (Cancel / Escape / Discard) —
          // unless it has since unmounted (e.g. the drawer closed on confirm),
          // in which case fall through to that surface's own focus restore.
          {...(controlled
            ? {
                onOpenAutoFocus: () => {
                  openerRef.current =
                    document.activeElement as HTMLElement | null;
                },
                onCloseAutoFocus: (event: Event) => {
                  const opener = openerRef.current;
                  if (opener && document.contains(opener)) {
                    event.preventDefault();
                    opener.focus();
                  }
                },
              }
            : {})}
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
