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
