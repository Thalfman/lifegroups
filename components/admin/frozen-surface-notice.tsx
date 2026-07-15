import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { FROZEN_SURFACE_EXPLAINER } from "@/lib/admin/frozen-surface-copy";

// The explicit "frozen" signal for ADR-0002 surfaces gated behind a default-off
// feature flag (#191 / ADR 0009). Rendered in place of the live surface when
// its flag is not enabled-and-verified, so the surface never reads as silently
// live — nor as broken. It reads as deliberately frozen, with the path back.
//
// `movedTo` (#901) adds a "this moved" pointer to the post-pivot surface that
// absorbed the workflow (registry-derived via movedToFor,
// lib/nav/route-registry) — the notice keeps the frozen-state explanation
// while still clearly pointing an old bookmark at the current home. Omitted
// (or null) where no live replacement exists (ADR 0033: check-ins).
export function FrozenSurfaceNotice({
  surfaceLabel,
  movedTo,
}: {
  surfaceLabel: string;
  movedTo?: { href: string; label: string } | null;
}) {
  return (
    <div className="grid place-items-center px-5 py-12">
      <div className="grid max-w-[520px] gap-3 rounded-lg border border-line bg-surface px-7 py-7 text-center">
        <Badge tone="ghost" className="justify-self-center">
          Frozen
        </Badge>
        <h1 className="m-0 font-display text-2xl font-semibold text-ink">
          {surfaceLabel} is frozen
        </h1>
        <p className="m-0 font-sans text-base text-ink2">
          {FROZEN_SURFACE_EXPLAINER}
        </p>
        {movedTo ? (
          <p className="m-0 font-sans text-base text-ink2">
            The current home for this work is{" "}
            <Link
              href={movedTo.href}
              className="font-semibold text-ink underline underline-offset-2"
            >
              {movedTo.label}
            </Link>
            .
          </p>
        ) : null}
      </div>
    </div>
  );
}
