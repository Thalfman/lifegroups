"use client";

// The standard Editing Pattern surface for the admin app (Admin Interaction
// Model PRD req 1, decided pattern). A record opened from a list is edited
// here, out of the list flow, rather than in an inline form:
//
//   - Desktop: a right-side drawer anchored to the viewport edge.
//   - Mobile (≤767px): a full-screen sheet (see .lg-m-editing-surface in
//     app/globals.css), so the whole edit flow is reachable on a phone.
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

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { P, fontBody, fontSans } from "@/lib/pastoral";

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
  // Small uppercase context line above the title (e.g. "Group health").
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  // Accessible name for the × control. Pass record context (e.g.
  // "Close Anderson health editor") so repeated surfaces stay distinguishable.
  closeLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onRequestClose();
      }}
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
          // Radix auto-associates the DialogDescription; when there is none,
          // opt out explicitly so it doesn't warn about a missing description.
          {...(description ? {} : { "aria-describedby": undefined })}
          className="lg-m-editing-surface"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            height: "100dvh",
            width: "min(460px, 94vw)",
            overflowY: "auto",
            background: P.bg,
            borderLeft: `1px solid ${P.line}`,
            padding: 0,
            zIndex: 61,
            boxShadow: "-18px 0 48px rgba(58, 42, 26, 0.22)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <header
            style={{
              padding: "18px 20px",
              borderBottom: `1px solid ${P.line}`,
              background: P.surface,
              display: "grid",
              gap: 6,
              position: "relative",
            }}
          >
            {eyebrow ? (
              <span
                style={{
                  fontFamily: fontSans,
                  fontSize: 11,
                  letterSpacing: 1.8,
                  textTransform: "uppercase",
                  color: P.ink3,
                  fontWeight: 700,
                }}
              >
                {eyebrow}
              </span>
            ) : null}
            <DialogTitle
              style={{
                fontFamily: fontBody,
                fontSize: 18,
                fontWeight: 600,
                color: P.ink,
                margin: 0,
                lineHeight: 1.3,
                paddingRight: 40,
              }}
            >
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription
                style={{
                  fontFamily: fontBody,
                  fontSize: 13,
                  color: P.ink2,
                  margin: 0,
                  lineHeight: 1.45,
                }}
              >
                {description}
              </DialogDescription>
            ) : null}
            <button
              type="button"
              onClick={onRequestClose}
              aria-label={closeLabel}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                background: "transparent",
                border: `1px solid ${P.line}`,
                borderRadius: 999,
                width: 32,
                height: 32,
                cursor: "pointer",
                color: P.ink2,
                fontFamily: fontSans,
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </header>

          <div style={{ padding: "18px 20px", display: "grid", gap: 16 }}>
            {children}
          </div>

          {footer ? (
            <footer
              style={{
                marginTop: "auto",
                borderTop: `1px solid ${P.line}`,
                background: P.surface,
                padding: "14px 20px",
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {footer}
            </footer>
          ) : null}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
