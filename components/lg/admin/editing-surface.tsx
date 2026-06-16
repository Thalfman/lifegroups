"use client";

// The standard Editing Pattern surface for the admin app (Admin Interaction
// Model PRD req 1, decided pattern). A record opened from a list is edited
// here, out of the list flow, rather than in an inline form:
//
//   - Desktop: a right-side drawer anchored to the viewport edge.
//   - Mobile (≤767px): a full-screen sheet, so the whole edit flow is
//     reachable on a phone.
//
// Focus & keyboard behaviour is delegated to Radix Dialog, which provides the
// checklist the PRD verifies on every migrated surface:
//   - opening moves focus into the surface;
//   - closing returns focus to the triggering control;
//   - Escape closes (onEscapeKeyDown → onOpenChange(false));
//   - the explicit Close control closes;
//   - focus is trapped inside while open, so a keyboard-only user completes
//     the flow without escaping to the list behind it.
//
// Unsaved-change handling is the caller's: `onRequestClose` fires for every
// dismissal route (Escape, overlay, Close button), so a caller with a dirty
// form can warn before discarding. This component never decides to discard.

import { useRef, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";

export function EditingSurface({
  open,
  onRequestClose,
  eyebrow,
  title,
  description,
  closeLabel = "Close",
  children,
  footer,
}: {
  open: boolean;
  // Fires on every dismissal route. The caller decides whether to honour it
  // (e.g. confirm first when there are unsaved changes).
  onRequestClose: () => void;
  // Context line above the title (e.g. "Group health") — plain 13px ink3, not
  // a tracked eyebrow.
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  // Accessible name for the × control. Pass record context (e.g.
  // "Close Anderson health editor") so repeated surfaces stay distinguishable.
  closeLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // The control that had focus when the surface opened, so we return focus to
  // it on close. Radix only auto-restores to a DialogTrigger element; surfaces
  // opened programmatically from a list have none, so the reusable surface owns
  // this itself — every consumer gets correct focus return for free.
  const openerRef = useRef<HTMLElement | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onRequestClose();
      }}
    >
      <DialogPortal>
        {/* Warm scrim — ink at 45%. */}
        <DialogOverlay className="fixed inset-0 z-overlay bg-ink/45" />
        <DialogContent
          // Radix auto-associates the DialogDescription; when there is none,
          // opt out explicitly so it doesn't warn about a missing description.
          {...(description ? {} : { "aria-describedby": undefined })}
          // Capture the opener before Radix moves focus inward, then restore to
          // it on close instead of Radix's default (which has no trigger to
          // return to here).
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
          className="fixed inset-y-0 right-0 z-drawer flex h-dvh w-full flex-col bg-bg shadow-softLg data-[state=open]:animate-[lg-drawer-in_200ms_ease-out] md:w-[min(460px,94vw)] md:border-l md:border-line"
        >
          <header className="relative grid gap-1.5 border-b border-line bg-surface px-5 pb-[18px] pt-[max(18px,env(safe-area-inset-top))]">
            {eyebrow ? (
              <span className="font-sans text-sm text-ink3">{eyebrow}</span>
            ) : null}
            <DialogTitle className="m-0 pr-10 font-display text-lg font-medium leading-snug text-ink">
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription className="m-0 font-sans text-sm text-ink2">
                {description}
              </DialogDescription>
            ) : null}
            <button
              type="button"
              onClick={onRequestClose}
              aria-label={closeLabel}
              className="absolute right-3.5 top-3.5 h-8 w-8 rounded-pill border border-line bg-transparent font-sans text-lg leading-none text-ink2 transition-colors duration-150 hover:bg-surfaceAlt"
            >
              ×
            </button>
          </header>

          <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 pt-[18px] pb-[max(18px,env(safe-area-inset-bottom))]">
            {children}
          </div>

          {footer ? (
            <footer className="flex flex-wrap justify-end gap-2.5 border-t border-line bg-surface px-5 pt-3.5 pb-[max(14px,env(safe-area-inset-bottom))]">
              {footer}
            </footer>
          ) : null}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
