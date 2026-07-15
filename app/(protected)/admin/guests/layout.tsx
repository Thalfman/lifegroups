import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { frozenSurfaceGate } from "@/components/admin/frozen-surface-gate";
import { movedToFor } from "@/lib/nav/route-registry";

export const dynamic = "force-dynamic";

// The guest pipeline is frozen (deferred under EXT.1). Per the #191 decision it
// is gated behind the default-off `guests` flag with an explicit frozen signal,
// alongside the two ADR-0002 surfaces. The gate runs requireAdmin() first so
// the existing access gate is never loosened. The flag-off notice carries a
// pointer to the Plan Interest Funnel — the workflow's post-pivot home (#901)
// — rather than redirecting: this route is also the preserved window into the
// legacy `guests` data (ADR 0033 erratum), which lives behind the flag, so the
// notice keeps the frozen-state explanation an old bookmark needs.
export default async function GuestsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return frozenSurfaceGate({
    guard: requireAdmin,
    flagKey: "guests",
    surfaceLabel: "The guest pipeline",
    movedTo: movedToFor("/admin/guests"),
    children,
  });
}
