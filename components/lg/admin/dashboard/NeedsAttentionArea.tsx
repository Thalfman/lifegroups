import Link from "next/link";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import {
  buildNeedsAttentionItems,
  type NeedsAttentionItem,
  type NeedsAttentionTone,
} from "@/lib/dashboard/needs-attention";

// Dashboard "Needs attention" area (Admin Interaction Model PRD req 7, #260).
//
// The landing must prioritise work, not only report it. This area surfaces the
// real admin actions that currently have something to act on — drawn from
// existing admin concerns where the admin can act (unassigned groups, leaders
// needing care, overdue/missing health checks, open follow-ups, setup gaps) —
// each with a live count and a direct link into the surface where the work
// happens, filtered where the destination supports it.
//
// The category/threshold rules (count > 0 only, no padding, frozen workflows
// excluded) live in lib/dashboard/needs-attention.ts. This file owns only the
// rendering and the empty / few-actions states. The ranked, imperative "do this
// next" ordering is P1 (req 8, #271) and is not done here.

function toneColor(tone: NeedsAttentionTone): string {
  return tone === "warning" ? P.mustard : P.terra;
}

function ActionTile({
  label,
  count,
  href,
  plus,
  tone,
}: Omit<NeedsAttentionItem, "key">) {
  return (
    <Link
      href={href}
      aria-label={`${label}: ${count}${plus ? "+" : ""} — review`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: "14px 16px",
        textDecoration: "none",
      }}
    >
      <span
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
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontFamily: fontDisplay,
            fontSize: 30,
            lineHeight: 1,
            color: toneColor(tone),
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {count}
          {plus ? "+" : ""}
        </span>
        <span style={{ fontFamily: fontBody, fontSize: 12.5, color: P.ink3 }}>
          review →
        </span>
      </span>
    </Link>
  );
}

function AllClear({ children }: { children: string }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: "14px 16px",
        fontFamily: fontBody,
        fontSize: 13.5,
        color: P.ink2,
      }}
    >
      {children}
    </div>
  );
}

export function NeedsAttentionArea({ data }: { data: AdminDashboardData }) {
  const items = buildNeedsAttentionItems(data);

  if (items.length === 0) {
    return <AllClear>Nothing needs your attention right now.</AllClear>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        className="lg-shell-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))",
          gap: 12,
        }}
      >
        {items.map(({ key, ...rest }) => (
          <ActionTile key={key} {...rest} />
        ))}
      </div>
      {items.length < 3 ? (
        <AllClear>Nothing else needs attention.</AllClear>
      ) : null}
    </div>
  );
}
