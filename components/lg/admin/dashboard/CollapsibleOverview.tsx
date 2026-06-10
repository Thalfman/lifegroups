"use client";

// Collapsible wrapper for the admin-landing overview-card grids (PRD-SAC6
// Feature 5, #292). The DashboardClient is a server component, so the grids
// live here as children of a native <details>/<summary> disclosure — the same
// JS-free pattern as components/admin/super-admin-collapsible-section.tsx.
//
// The open/closed choice is the admin's own default: it persists per profile
// id via usePersistedViewState (localStorage only — no DB table) and survives
// reload. Hydration-safe by construction: SSR and the first client render emit
// the default (open) so server/client markup match; the persisted choice is
// adopted only after the restore effect runs.

import { useState, type ReactNode } from "react";
import { usePersistedViewState } from "@/lib/hooks/use-persisted-view-state";

const SURFACE = "admin-overview-cards";

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function Chevron() {
  return (
    <span className="lg-sac-chevron inline-flex text-ink3" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M4 2l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function CollapsibleOverview({
  scopeId,
  children,
}: {
  // Signed-in profile id, used only to scope this admin's saved default.
  scopeId: string | null | undefined;
  children: ReactNode;
}) {
  // Default open on SSR + first client render so markup matches; the hook
  // restores the persisted choice after mount.
  const [open, setOpen] = useState(true);

  usePersistedViewState<boolean>({
    surface: SURFACE,
    scopeId,
    snapshot: open,
    restore: (saved) => setOpen(saved),
    validate: isBoolean,
  });

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-lg border border-line bg-surface"
    >
      <summary className="lg-sac-summary flex items-center gap-2.5 px-4 py-3.5 font-display text-lg font-medium text-ink">
        <Chevron />
        <span className="flex-1">Overview</span>
      </summary>
      <div className="grid gap-4 px-4 pb-5 pt-1">{children}</div>
    </details>
  );
}
