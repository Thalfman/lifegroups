import type { ReactNode } from "react";
import { isFrozenSurfaceLive } from "@/lib/admin/frozen-surface";
import { FrozenSurfaceNotice } from "@/components/admin/frozen-surface-notice";

// The frozen-surface gate composed once (#191 / ADR 0002 + 0009). A frozen
// layout names its facts — the access guard, the flag key, and the surface
// label — and this gate owns the order: run the guard first so the existing
// access gate is never loosened, then show the live surface only when the
// flag is enabled-and-verified (isFrozenSurfaceLive encodes ADR 0009's
// verify-before-flip rule), otherwise the explicit frozen notice. The notice
// (not a redirect) is deliberate — these routes are windows into legacy data
// (guests) or unreplaced workflows (check-ins, ADR 0033), so routing an old
// bookmark elsewhere would land on a different dataset without the
// frozen-state explanation. Where a post-pivot workflow home exists, the
// optional registry-derived `movedTo` pointer names it inside the notice
// (#901). Folding the composition here means a layout can no longer drop the
// flag check and silently re-expose a frozen surface.
export async function frozenSurfaceGate({
  guard,
  flagKey,
  surfaceLabel,
  movedTo,
  children,
}: {
  guard: () => Promise<unknown>;
  flagKey: string;
  surfaceLabel: string;
  // movedToFor(<route>) from lib/nav/route-registry; null = no live home.
  movedTo?: { href: string; label: string } | null;
  children: ReactNode;
}): Promise<ReactNode> {
  await guard();
  if (await isFrozenSurfaceLive(flagKey)) return <>{children}</>;
  return <FrozenSurfaceNotice surfaceLabel={surfaceLabel} movedTo={movedTo} />;
}
