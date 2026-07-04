import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LaunchPlanningRiskLevel } from "@/lib/admin/launch-planning";
import { CANDIDATE_STATUS_LABEL } from "@/lib/admin/multiplication";
import type { MultiplicationCandidateStatus } from "@/types/enums";
import type { MultiplicationDashboardSummary } from "@/lib/dashboard/types";
import { StatusCard } from "@/components/dashboard/cards";
import { FROZEN_SURFACE_EXPLAINER } from "@/lib/admin/frozen-surface-copy";

// Candidate statuses in the order both multiplication-candidate lines render.
const CANDIDATE_ORDER: MultiplicationCandidateStatus[] = [
  "watching",
  "planned",
  "launched",
  "deferred",
];

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
  toneClassName = "bg-clay",
}: {
  label: string;
  count: number;
  total: number;
  toneClassName?: string;
}) {
  // Clamp to 100 so a stray count > total can never overflow the track.
  const pct = total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(96px,auto)_1fr_auto] items-center gap-3 py-1">
      <span className="font-sans text-sm text-ink2">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-pill bg-lineSoft">
        <div
          className={`h-full rounded-pill ${toneClassName}`}
          // Data-driven fill width — stays inline.
          style={{ width: `${pct}%` }}
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
  valueClassName,
  hint,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-sm bg-surfaceAlt px-3 py-2.5">
      <div className="font-sans text-xs text-ink3">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={
            "font-display text-2xl tabular-nums leading-none " +
            (valueClassName ?? "text-ink")
          }
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

// The muted empty-state paragraph shared by the overview cards' "nothing here
// yet" branch (health pulse, Interest Funnel, multiplication readiness, leader
// pipeline, guest funnel). Renders the exact style the cards used inline.
export function CardNote({ children }: { children: ReactNode }) {
  return <p className="m-0 font-sans text-[12.5px] text-ink3">{children}</p>;
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

// Divider row + candidate-counts line shared by the Launch planning and
// Multiply overview cards. `eyebrow` is the leading uppercase label
// ("Multiplication" or "Planner"). Renders an explicit unavailable note rather
// than dropping the line, so a failed candidate read never reads as
// "no candidates".
export function CandidateCountsLine({
  eyebrow,
  multiplication,
}: {
  eyebrow: string;
  multiplication: MultiplicationDashboardSummary;
}) {
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-3 border-t border-lineSoft pt-3">
      <span className="font-sans text-xs font-semibold uppercase text-ink3">
        {eyebrow}
      </span>
      <span
        className={cn(
          "font-sans text-[12.5px]",
          multiplication.available ? "text-ink2" : "italic text-ink3"
        )}
      >
        {multiplication.available
          ? CANDIDATE_ORDER.map(
              (s, i) =>
                `${CANDIDATE_STATUS_LABEL[s]} ${multiplication.counts[s]}${
                  i < CANDIDATE_ORDER.length - 1 ? "  ·  " : ""
                }`
            ).join("")
          : "Data unavailable"}
      </span>
    </div>
  );
}

// Shared launch-risk → {label, tone class} mapping so the vital-signs tile and
// the Launch planning overview card agree on wording and color.
export function launchRiskDisplay(level: LaunchPlanningRiskLevel): {
  label: string;
  toneTextClassName: string;
} {
  if (level === "launch_needed")
    return { label: "Launch needed", toneTextClassName: "text-clay" };
  if (level === "watch")
    return { label: "Watch", toneTextClassName: "text-amber" };
  return { label: "On track", toneTextClassName: "text-sage" };
}
