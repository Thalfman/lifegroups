import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { frozenSurfaceGate } from "@/components/admin/frozen-surface-gate";
import { canonicalFor } from "@/lib/nav/route-registry";

export const dynamic = "force-dynamic";

// Weekly check-ins are frozen (ADR 0002). #191 / ADR 0009 gate the surface
// behind the default-off `check_ins` flag. The gate runs requireAdmin() first
// so the existing access gate stays intact; while the flag is off, old
// check-in bookmarks (this layout covers /admin/check-ins/[groupId] too) land
// on Care — the area that absorbed this workflow (#901).
export default async function CheckInsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return frozenSurfaceGate({
    guard: requireAdmin,
    flagKey: "check_ins",
    canonicalHref: canonicalFor("/admin/check-ins") ?? "/admin/care",
    children,
  });
}
