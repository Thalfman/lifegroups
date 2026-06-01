import type { ReactNode } from "react";
import Link from "next/link";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type { LaunchPlanningRiskLevel } from "@/lib/admin/launch-planning";

// Shared building blocks for the warm executive overview on /admin. They reuse
// the pastoral palette (lib/pastoral.ts) so the landing meshes with the Leader
// care / Launch planning surfaces instead of clashing in near-white lg cards.
// The inner tiles use the *defined* P.bg / P.bgDeep cream surfaces — the old
// landing cards referenced an undefined `--c-bgDeep` CSS var, so their tiles
// rendered transparent; these don't.

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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(96px, auto) 1fr auto",
        alignItems: "center",
        gap: 12,
        padding: "5px 0",
      }}
    >
      <span style={{ fontFamily: fontBody, fontSize: 12.5, color: P.ink2 }}>
        {label}
      </span>
      <div
        style={{
          height: 6,
          background: P.line2,
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: tone,
            borderRadius: 999,
          }}
        />
      </div>
      <span
        style={{
          fontFamily: fontDisplay,
          fontSize: 15,
          color: P.ink,
          minWidth: 24,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
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
    <div
      style={{
        background: P.bg,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <div
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 1.3,
          color: P.ink3,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontFamily: fontDisplay,
            fontSize: 24,
            lineHeight: 1,
            color: valueColor ?? P.ink,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {hint ? (
          <span style={{ fontFamily: fontBody, fontSize: 11.5, color: P.ink3 }}>
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function StatTileGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))",
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}

// "Open →" affordance for the StatusCard `action` slot. Inherits the card's
// terra action color.
export function OpenLink({
  href,
  label = "Open",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      style={{ color: "inherit", textDecoration: "none", whiteSpace: "nowrap" }}
    >
      {label} →
    </Link>
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
