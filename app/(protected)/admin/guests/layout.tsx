import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { frozenSurfaceGate } from "@/components/admin/frozen-surface-gate";
import { canonicalFor } from "@/lib/nav/route-registry";

export const dynamic = "force-dynamic";

// The guest pipeline is frozen (deferred under EXT.1). Per the #191 decision it
// is gated behind the default-off `guests` flag, alongside the two ADR-0002
// surfaces. The gate runs requireAdmin() first so the existing access gate is
// never loosened; while the flag is off, old guest bookmarks land on the Plan
// Interest Funnel — the surface that absorbed this workflow (#901).
export default async function GuestsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return frozenSurfaceGate({
    guard: requireAdmin,
    flagKey: "guests",
    canonicalHref: canonicalFor("/admin/guests") ?? "/admin/plan",
    children,
  });
}
