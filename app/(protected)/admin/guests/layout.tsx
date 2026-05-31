import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { isFrozenSurfaceLive } from "@/lib/admin/frozen-surface";
import { FrozenSurfaceNotice } from "@/components/admin/frozen-surface-notice";

export const dynamic = "force-dynamic";

// The guest pipeline is frozen (deferred under EXT.1). Per the #191 decision it
// is gated behind the default-off `guests` flag with an explicit frozen signal,
// alongside the two ADR-0002 surfaces. requireAdmin() runs first so the
// existing access gate is never loosened.
export default async function GuestsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin();
  if (await isFrozenSurfaceLive("guests")) return <>{children}</>;
  return <FrozenSurfaceNotice surfaceLabel="The guest pipeline" />;
}
