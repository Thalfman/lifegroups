import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isFrozenSurfaceLive } from "@/lib/admin/frozen-surface";

// The frozen-surface gate composed once (#191 / ADR 0002 + 0009). A frozen
// layout names its facts — the access guard, the flag key, and the canonical
// home — and this gate owns the order: run the guard first so the existing
// access gate is never loosened, then show the live surface only when the
// flag is enabled-and-verified (isFrozenSurfaceLive encodes ADR 0009's
// verify-before-flip rule). While the flag is off (or unreadable — fail
// closed), the surface's old bookmark routes to the post-pivot surface that
// absorbed its workflow (#901) instead of dead-ending at a frozen notice.
// The Super-Admin flag stays authoritative: re-enabling the surface restores
// today's behavior unchanged. Folding the composition here means a layout can
// no longer drop the flag check and silently re-expose a frozen surface.
export async function frozenSurfaceGate({
  guard,
  flagKey,
  canonicalHref,
  children,
}: {
  guard: () => Promise<unknown>;
  flagKey: string;
  // The registry-recorded canonical home (canonicalFor, lib/nav/route-registry)
  // the flag-off redirect lands on.
  canonicalHref: string;
  children: ReactNode;
}): Promise<ReactNode> {
  await guard();
  if (await isFrozenSurfaceLive(flagKey)) return <>{children}</>;
  redirect(canonicalHref);
}
