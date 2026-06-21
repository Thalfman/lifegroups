"use client";

import * as React from "react";
import {
  Root as Popover,
  Trigger as PopoverTrigger,
  Anchor as PopoverAnchor,
  Portal as PopoverPortal,
  Content as RadixPopoverContent,
  type PopoverContentProps,
} from "@radix-ui/react-popover";

// The shared popover primitive (#776, Phase 0). Wraps Radix so anchored,
// dismissible panels (the Super-Admin inline-delete confirm; later OPP-8's
// read-only "why?" peek) stop hand-rolling absolute positioning. Sibling of
// `components/ui/dialog.tsx` / `dropdown-menu.tsx`.
//
// The wrapped Content portals itself and applies the app's card chrome on the
// `z-dropdown` layer. Callers pass their own `className` to override (e.g. the
// inline-delete panel keeps its 280px width + role="dialog").
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof RadixPopoverContent>,
  PopoverContentProps
>(({ className, sideOffset = 6, align = "end", ...props }, ref) => (
  <PopoverPortal>
    <RadixPopoverContent
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      className={
        className ??
        "z-dropdown grid gap-2.5 rounded-md border border-line bg-surface p-3 shadow-softLg"
      }
      {...props}
    />
  </PopoverPortal>
));
PopoverContent.displayName = RadixPopoverContent.displayName;

export {
  Popover,
  PopoverTrigger,
  PopoverAnchor,
  PopoverPortal,
  PopoverContent,
};
