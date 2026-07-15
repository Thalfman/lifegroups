import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isFrozenSurfaceLive } from "@/lib/admin/frozen-surface";
import { FrozenSurfaceNotice } from "@/components/admin/frozen-surface-notice";

// What a frozen surface does while its flag is off (or unreadable — fail
// closed). A surface whose workflow was genuinely absorbed by a post-pivot
// area redirects there (#901); a surface with NO live replacement (ADR 0033:
// weekly check-ins — "no canonical surface covers them") keeps the explicit
// frozen notice, because routing its old bookmarks to an unrelated area would
// lose the frozen-state explanation without landing on the work.
export type FrozenSurfaceFallback =
  | { redirectTo: string }
  | { notice: { surfaceLabel: string } };

// The frozen-surface gate composed once (#191 / ADR 0002 + 0009). A frozen
// layout names its facts — the access guard, the flag key, and the flag-off
// fallback — and this gate owns the order: run the guard first so the
// existing access gate is never loosened, then show the live surface only
// when the flag is enabled-and-verified (isFrozenSurfaceLive encodes ADR
// 0009's verify-before-flip rule), otherwise the declared fallback. The
// Super-Admin flag stays authoritative: re-enabling the surface restores
// today's behavior unchanged. Folding the composition here means a layout can
// no longer drop the flag check and silently re-expose a frozen surface.
export async function frozenSurfaceGate({
  guard,
  flagKey,
  whenFrozen,
  children,
}: {
  guard: () => Promise<unknown>;
  flagKey: string;
  whenFrozen: FrozenSurfaceFallback;
  children: ReactNode;
}): Promise<ReactNode> {
  await guard();
  if (await isFrozenSurfaceLive(flagKey)) return <>{children}</>;
  if ("redirectTo" in whenFrozen) redirect(whenFrozen.redirectTo);
  return <FrozenSurfaceNotice surfaceLabel={whenFrozen.notice.surfaceLabel} />;
}
