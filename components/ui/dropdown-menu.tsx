"use client";

import * as React from "react";
import {
  Root as DropdownMenu,
  Trigger as DropdownMenuTrigger,
  Portal as DropdownMenuPortal,
  Content as RadixDropdownMenuContent,
  Item as DropdownMenuItem,
  Separator as DropdownMenuSeparator,
  type DropdownMenuContentProps,
} from "@radix-ui/react-dropdown-menu";

// The shared dropdown-menu primitive (#776, Phase 0). Wraps Radix so the app
// has one accessible, keyboard-correct, collision-aware menu instead of the
// hand-rolled portal/viewport math that `group-actions-menu` carried. Sibling
// of `components/ui/dialog.tsx` (same re-export shape over the matching Radix
// package).
//
// The wrapped Content portals itself and applies the app's menu chrome — the
// `z-dropdown` layer plus the warm surface card — so call sites only describe
// items. `sideOffset` mirrors the 6px trigger gap the old menu used.
const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof RadixDropdownMenuContent>,
  DropdownMenuContentProps
>(({ className, sideOffset = 6, align = "end", ...props }, ref) => (
  <DropdownMenuPortal>
    <RadixDropdownMenuContent
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      className={
        className ??
        "z-dropdown grid min-w-[190px] gap-1.5 rounded-md border-0 bg-surface p-2 shadow-softLg"
      }
      {...props}
    />
  </DropdownMenuPortal>
));
DropdownMenuContent.displayName = RadixDropdownMenuContent.displayName;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
};
