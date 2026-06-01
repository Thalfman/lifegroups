import type { ReactNode } from "react";
import { requireLeader } from "@/lib/auth/session";
import { frozenSurfaceGate } from "@/components/admin/frozen-surface-gate";

export const dynamic = "force-dynamic";

// LDR.1 (ADR 0002): the Leader surface is frozen. #191 / ADR 0009 route it
// through the default-off `leader_surface` flag and show an explicit frozen
// signal until the flag is enabled-and-verified. The gate runs requireLeader()
// first so the existing access gate is never loosened — only authenticated
// leaders ever reach either the frozen notice or (once re-enabled) the surface.
export default async function LeaderLayout({
  children,
}: {
  children: ReactNode;
}) {
  return frozenSurfaceGate({
    guard: requireLeader,
    flagKey: "leader_surface",
    surfaceLabel: "The Leader surface",
    children,
  });
}
