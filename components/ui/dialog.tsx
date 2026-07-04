"use client";

import * as React from "react";
import {
  Root as Dialog,
  Trigger as DialogTrigger,
  Portal as DialogPortal,
  Overlay as DialogOverlay,
  Content as RadixDialogContent,
  Title as DialogTitle,
  Description as DialogDescription,
  Close as DialogClose,
  type DialogContentProps,
} from "@radix-ui/react-dialog";

// Convention: a dialog that genuinely has no description (e.g. a nav drawer
// with only a title) passes `aria-describedby={undefined}` — the
// Radix-documented opt-out that silences its missing-Description warning.
// A dialog that DOES render a <DialogDescription> must NOT pass it, or the
// explicit undefined severs the description it already has.
const DialogContent = React.forwardRef<
  React.ElementRef<typeof RadixDialogContent>,
  DialogContentProps
>(({ "aria-modal": ariaModal = true, ...props }, ref) => (
  <RadixDialogContent ref={ref} aria-modal={ariaModal} {...props} />
));
DialogContent.displayName = RadixDialogContent.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
