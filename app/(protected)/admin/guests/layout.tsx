import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { frozenSurfaceGate } from "@/components/admin/frozen-surface-gate";

export const dynamic = "force-dynamic";

// The guest pipeline is frozen (deferred under EXT.1). Per the #191 decision it
// is gated behind the default-off `guests` flag with an explicit frozen signal,
// alongside the two ADR-0002 surfaces. The gate runs requireAdmin() first so
// the existing access gate is never loosened.
export default async function GuestsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return frozenSurfaceGate({
    guard: requireAdmin,
    flagKey: "guests",
    surfaceLabel: "The guest pipeline",
    children,
  });
}
