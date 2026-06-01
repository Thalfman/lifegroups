import type { ReactNode } from "react";
import { isFrozenSurfaceLive } from "@/lib/admin/frozen-surface";
import { FrozenSurfaceNotice } from "@/components/admin/frozen-surface-notice";

// The frozen-surface gate composed once (#191 / ADR 0002 + 0009). A frozen
// layout names its three facts — the access guard, the flag key, and the
// surface label — and this gate owns the order: run the guard first so the
// existing access gate is never loosened, then show the live surface only when
// the flag is enabled-and-verified (isFrozenSurfaceLive encodes ADR 0009's
// verify-before-flip rule), otherwise the explicit frozen notice. Folding the
// composition here means a layout can no longer drop the flag check and
// silently re-expose a frozen surface.
export async function frozenSurfaceGate({
  guard,
  flagKey,
  surfaceLabel,
  children,
}: {
  guard: () => Promise<unknown>;
  flagKey: string;
  surfaceLabel: string;
  children: ReactNode;
}): Promise<ReactNode> {
  await guard();
  if (await isFrozenSurfaceLive(flagKey)) return <>{children}</>;
  return <FrozenSurfaceNotice surfaceLabel={surfaceLabel} />;
}
