import Link from "next/link";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import {
  buildTopNextActions,
  type NeedsAttentionTone,
  type TopNextAction,
} from "@/lib/dashboard/needs-attention";

// Dashboard "Needs attention" area, now a ranked "Top next actions" queue
// (Admin Interaction Model PRD req 7 #260 + req 8 #271).
//
// The landing must prioritise work, not only report it. #260 surfaced the real
// admin concerns as an unordered tile grid; #271 evolves that same area into a
// single ranked list that orders ACROSS the categories by a fixed priority and
// phrases each as an imperative action ("Assign leaders to 16 groups"), with a
// direct link into the surface where the work happens.
//
// The ordering, imperative phrasing, and category/threshold rules (count > 0
// only, no padding, frozen workflows excluded, degraded → nothing) live in
// lib/dashboard/needs-attention.ts. This file owns only the rendering and the
// single consolidated empty / few-actions states. Per the #271 sign-off the
// queue and the minimal area share one empty-state behaviour: zero-count
// categories drop out, and an empty queue collapses to one "all clear" row.

function toneColor(tone: NeedsAttentionTone): string {
  return tone === "warning" ? P.mustard : P.terra;
}

function ActionRow({
  rank,
  action,
  why,
  count,
  href,
  plus,
  tone,
}: Pick<
  TopNextAction,
  "action" | "why" | "count" | "href" | "plus" | "tone"
> & {
  rank: number;
}) {
  return (
    <li style={{ listStyle: "none", margin: 0 }}>
      <Link
        href={href}
        aria-label={`${action}. ${why} Review.`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderLeft: `3px solid ${toneColor(tone)}`,
          borderRadius: 12,
          padding: "12px 14px",
          textDecoration: "none",
        }}
      >
        <span
          aria-hidden
          style={{
            flex: "0 0 auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 999,
            background: P.bg,
            border: `1px solid ${P.line}`,
            fontFamily: fontDisplay,
            fontSize: 13,
            color: P.ink3,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {rank}
        </span>
        <span
          style={{
            flex: "1 1 auto",
            display: "grid",
            gap: 2,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontFamily: fontBody,
              fontSize: 14.5,
              color: P.ink,
              fontWeight: 600,
            }}
          >
            {action}
          </span>
          <span
            style={{
              fontFamily: fontBody,
              fontSize: 12.5,
              color: P.ink3,
              fontWeight: 400,
            }}
          >
            {why}
          </span>
        </span>
        <span
          aria-hidden
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: fontDisplay,
              fontSize: 22,
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
    </li>
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

export function NeedsAttentionArea({
  data,
  degraded,
}: {
  data: AdminDashboardData;
  // The dashboard read degraded to demo fallback; suppress the queue so its
  // counts and links are never mistaken for live work to do.
  degraded?: boolean;
}) {
  const actions = buildTopNextActions(data, { degraded });

  if (actions.length === 0) {
    return <AllClear>Nothing needs your attention right now.</AllClear>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <ol
        aria-label="Top next actions"
        style={{ display: "grid", gap: 8, margin: 0, padding: 0 }}
      >
        {actions.map(({ key, action, why, count, href, plus, tone }, i) => (
          <ActionRow
            key={key}
            rank={i + 1}
            action={action}
            why={why}
            count={count}
            href={href}
            plus={plus}
            tone={tone}
          />
        ))}
      </ol>
      {actions.length < 3 ? (
        <AllClear>Nothing else needs attention.</AllClear>
      ) : null}
    </div>
  );
}
