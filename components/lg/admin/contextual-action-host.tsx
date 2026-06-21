"use client";

import type { ReactNode } from "react";
import {
  ContextualActionProvider,
  type ContextualActionBodies,
} from "@/components/lg/admin/contextual-action-provider";
import { CARE_CONTEXTUAL_BODIES } from "@/components/admin/care/contextual-care-bodies";

// The admin-layout adapter for the shared contextual-action host (#776 Phase 1).
// The admin layout is a Server Component, so it can't hand the provider a map of
// client render-fns directly; this thin client wrapper owns that map and renders
// the provider with it. Phase 1 registers the Care drawer bodies (OPP-1); the
// group editor body (OPP-2) is wired through the existing GroupActionsMenu +
// GroupEditorDrawer in the group surfaces, not this host, so it isn't registered
// here yet.
const ADMIN_CONTEXTUAL_BODIES: ContextualActionBodies = {
  ...CARE_CONTEXTUAL_BODIES,
};

export function AdminContextualActionHost({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ContextualActionProvider bodies={ADMIN_CONTEXTUAL_BODIES}>
      {children}
    </ContextualActionProvider>
  );
}
