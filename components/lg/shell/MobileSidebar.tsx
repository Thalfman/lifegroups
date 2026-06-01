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
          className="lg-shell-mobile-trigger"
          style={{
            display: "none",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 8,
            border: "1px solid var(--c-line)",
            background: "var(--c-surface)",
            color: "var(--c-ink2)",
            cursor: "pointer",
          }}
        >
          <Icon name="list" size={18} />
        </button>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(60, 45, 30, 0.35)",
            zIndex: 50,
          }}
        />
        <DialogContent
          aria-describedby={undefined}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            width: "min(280px, 84vw)",
            background: "var(--c-sidebar)",
            zIndex: 51,
            boxShadow: "var(--c-shadowLg)",
            overflow: "hidden",
          }}
        >
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogClose
            asChild
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              zIndex: 2,
            }}
          >
            <button
              type="button"
              aria-label="Close navigation"
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: "var(--c-surfaceAlt)",
                border: "1px solid var(--c-line)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                color: "var(--c-ink2)",
              }}
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
