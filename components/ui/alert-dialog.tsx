"use client";

import * as React from "react";
import {
  Root as AlertDialog,
  Trigger as AlertDialogTrigger,
  Portal as AlertDialogPortal,
  Overlay as AlertDialogOverlay,
  Content as RadixAlertDialogContent,
  Title as AlertDialogTitle,
  Description as AlertDialogDescription,
  Action as AlertDialogAction,
  Cancel as AlertDialogCancel,
  type AlertDialogContentProps,
} from "@radix-ui/react-alert-dialog";

// Thin wrapper over Radix `AlertDialog`, matching the `components/ui/dialog.tsx`
// pattern. AlertDialog (vs Dialog) is the right primitive for a confirm gate:
// it carries `role="alertdialog"`, requires a title + description for screen
// readers, traps focus, restores focus to the opener on close, and defaults
// initial focus to the Cancel control so a stray Enter never fires the
// destructive Action. It is non-blocking — opening it paints immediately
// rather than freezing the main thread the way `window.confirm` does.
const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof RadixAlertDialogContent>,
  AlertDialogContentProps
>((props, ref) => <RadixAlertDialogContent ref={ref} {...props} />);
AlertDialogContent.displayName = RadixAlertDialogContent.displayName;

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
