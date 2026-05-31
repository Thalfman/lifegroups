import type { ReactNode } from "react";
import { requireLeader } from "@/lib/auth/session";
import { isFrozenSurfaceLive } from "@/lib/admin/frozen-surface";
import { FrozenSurfaceNotice } from "@/components/admin/frozen-surface-notice";

export const dynamic = "force-dynamic";

// LDR.1 (ADR 0002): the Leader surface is frozen. #191 / ADR 0009 route it
// through the default-off `leader_surface` flag and show an explicit frozen
// signal until the flag is enabled-and-verified. requireLeader() runs first so
// the existing access gate is never loosened — only authenticated leaders ever
// reach either the frozen notice or (once re-enabled) the live surface.
export default async function LeaderLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireLeader();
  if (await isFrozenSurfaceLive("leader_surface")) return <>{children}</>;
  return <FrozenSurfaceNotice surfaceLabel="The Leader surface" />;
}
