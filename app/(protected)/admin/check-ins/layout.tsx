import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { isFrozenSurfaceLive } from "@/lib/admin/frozen-surface";
import { FrozenSurfaceNotice } from "@/components/admin/frozen-surface-notice";

export const dynamic = "force-dynamic";

// Weekly check-ins are frozen (ADR 0002). #191 / ADR 0009 gate the surface
// behind the default-off `check_ins` flag with an explicit frozen signal.
// requireAdmin() runs first so the existing access gate stays intact.
export default async function CheckInsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin();
  if (await isFrozenSurfaceLive("check_ins")) return <>{children}</>;
  return <FrozenSurfaceNotice surfaceLabel="Weekly check-ins" />;
}
