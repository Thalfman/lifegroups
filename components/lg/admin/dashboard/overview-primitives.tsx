import type { ReactNode } from "react";
import Link from "next/link";
import { P } from "@/lib/pastoral";
import type { LaunchPlanningRiskLevel } from "@/lib/admin/launch-planning";
import { StatusCard } from "@/components/dashboard/cards";
import { FROZEN_SURFACE_EXPLAINER } from "@/lib/admin/frozen-surface-copy";

// Shared building blocks for the warm executive overview on /admin, on the
// design-system anatomy: sentence-case labels, serif figures, surfaceAlt
// in-card groupings (no nested borders).

// Horizontal distribution bar (label · track · count). Re-skinned from the
// former CapacityBuckets bar so health pulse, guest funnel, pipeline stages and
// multiplication statuses all read the same way.
export function MiniBarRow({
  label,
  count,
  total,
  tone = P.terra,
}: {
  label: string;
  count: number;
  total: number;
  tone?: string;
}) {
  // Clamp to 100 so a stray count > total can never overflow the track.
  const pct = total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(96px,auto)_1fr_auto] items-center gap-3 py-1">
      <span className="font-sans text-sm text-ink2">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-pill bg-lineSoft">
        <div
          className="h-full rounded-pill"
          style={{ width: `${pct}%`, background: tone }}
        />
      </div>
      <span className="min-w-6 text-right font-display text-md tabular-nums text-ink">
        {count}
      </span>
    </div>
  );
}

// A small cream stat tile (label + serif value) for the clusters inside the
// Leader care / Launch planning overview cards.
export function StatTile({
  label,
  value,
  valueColor,
  hint,
}: {
  label: string;
  value: ReactNode;
  valueColor?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-sm bg-surfaceAlt px-3 py-2.5">
      <div className="font-sans text-xs text-ink3">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="font-display text-2xl tabular-nums leading-none"
          style={{ color: valueColor ?? P.ink }}
        >
          {value}
        </span>
        {hint ? (
          <span className="font-sans text-xs text-ink3">{hint}</span>
        ) : null}
      </div>
    </div>
  );
}

export function StatTileGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(124px,1fr))] gap-2.5">
      {children}
    </div>
  );
}

// Outcome-naming link affordance for the StatusCard `action` slot. Inherits the
// card's terra action color. Per #299 (Home as a triage page) every call site
// passes a specific, outcome-naming label ("Review group health", "Contact
// leaders", "View launch plan") — there is deliberately no generic "Open"
// default, so a new card can't silently reintroduce a vague affordance.
export function OpenLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap text-inherit no-underline hover:underline"
    >
      {label} →
    </Link>
  );
}

// A dashboard card for an ADR-0002 frozen surface (#256). The route-level pair
// (frozenSurfaceGate + FrozenSurfaceNotice) signals the freeze *after* the user
// navigates; this is its dashboard-card analogue, so an overview card for a
// frozen surface never presents it as an active workflow — no Open link, no
// live data, a muted "Deferred" affordance and the shared explainer instead.
// Keep the eyebrow/title identical to the live card so the freeze reads as the
// same surface deliberately deferred, not a different (broken) one.
export function FrozenStatusCard({
  eyebrow,
  title,
}: {
  eyebrow: ReactNode;
  title: string;
}) {
  return (
    <StatusCard
      eyebrow={eyebrow}
      title={title}
      action={<span className="text-ink3">Deferred</span>}
    >
      <p className="m-0 font-sans text-sm text-ink3">
        {FROZEN_SURFACE_EXPLAINER}
      </p>
    </StatusCard>
  );
}

// Shared launch-risk → {label, tone} mapping so the vital-signs tile and the
// Launch planning overview card agree on wording and color.
export function launchRiskDisplay(level: LaunchPlanningRiskLevel): {
  label: string;
  tone: string;
} {
  if (level === "launch_needed")
    return { label: "Launch needed", tone: P.terra };
  if (level === "watch") return { label: "Watch", tone: P.mustard };
  return { label: "On track", tone: P.sage };
}
