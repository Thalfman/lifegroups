import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { frozenSurfaceGate } from "@/components/admin/frozen-surface-gate";

export const dynamic = "force-dynamic";

// Weekly check-ins are frozen (ADR 0002). #191 / ADR 0009 gate the surface
// behind the default-off `check_ins` flag with an explicit frozen signal.
// The gate runs requireAdmin() first so the existing access gate stays
// intact. Unlike guests (whose workflow the Plan Interest Funnel absorbed),
// check-ins keep the notice rather than a redirect while the flag is off:
// per ADR 0033 no canonical surface covers the weekly review, so there is no
// "current home" to route an old bookmark to (this layout covers
// /admin/check-ins/[groupId] too).
export default async function CheckInsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return frozenSurfaceGate({
    guard: requireAdmin,
    flagKey: "check_ins",
    whenFrozen: { notice: { surfaceLabel: "Weekly check-ins" } },
    children,
  });
}
