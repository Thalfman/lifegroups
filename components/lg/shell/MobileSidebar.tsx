"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Icon } from "../Icon";
import { Sidebar } from "./Sidebar";
import type { AdminNavGroup } from "@/lib/auth/roles";

export function MobileSidebarTrigger({
  navGroups,
  homeHref = "/admin",
}: {
  navGroups: AdminNavGroup[];
  homeHref?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-surface text-ink2 md:hidden"
        >
          <Icon name="list" size={18} />
        </button>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-overlay bg-ink/45" />
        <DialogContent
          aria-describedby={undefined}
          // Edge-anchored under `viewport-fit=cover`: pad the nav off the notch,
          // home indicator, and left safe area (#651).
          className="fixed bottom-0 left-0 top-0 z-drawer w-[min(280px,84vw)] overflow-hidden bg-sidebar pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] shadow-softLg"
        >
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute right-3.5 top-[max(14px,env(safe-area-inset-top))] z-[2] grid h-8 w-8 place-items-center rounded-sm border border-line bg-surfaceAlt text-ink2"
            >
              <Icon name="x" size={15} />
            </button>
          </DialogClose>
          <Sidebar
            navGroups={navGroups}
            onNavigate={() => setOpen(false)}
            asDrawer
            homeHref={homeHref}
          />
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
