import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonClassName } from "@/components/ui/button";
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
//
// This is the hero of Home: status dot + imperative sentence + count + a
// Review affordance that wraps below the sentence on narrow phones instead of
// clipping at the viewport edge.

function toneDotClass(tone: NeedsAttentionTone): string {
  return tone === "warning" ? "bg-amber" : "bg-clay";
}

function toneFigureClass(tone: NeedsAttentionTone): string {
  return tone === "warning" ? "text-amberText" : "text-clayDeep";
}

function ActionRow({
  action,
  why,
  count,
  href,
  plus,
  tone,
}: Pick<TopNextAction, "action" | "why" | "count" | "href" | "plus" | "tone">) {
  return (
    <li className="m-0 list-none">
      <Link
        href={href}
        aria-label={`${action}. ${why} Review.`}
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-surface px-3.5 py-3 no-underline transition-colors duration-150 hover:bg-surfaceAlt"
      >
        <span
          aria-hidden="true"
          className={cn("h-2 w-2 shrink-0 rounded-pill", toneDotClass(tone))}
        />
        <span className="grid min-w-0 flex-1 basis-48 gap-0.5">
          <span className="font-sans text-base font-semibold text-ink">
            {action}
          </span>
          <span className="font-sans text-sm text-ink3">{why}</span>
        </span>
        <span aria-hidden="true" className="flex shrink-0 items-center gap-2.5">
          <span
            className={cn(
              "font-display text-xl tabular-nums leading-none",
              toneFigureClass(tone)
            )}
          >
            {count}
            {plus ? "+" : ""}
          </span>
          <span className={buttonClassName("ghost", "sm")}>Review →</span>
        </span>
      </Link>
    </li>
  );
}

function AllClear({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3.5 font-sans text-base text-ink2">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-pill bg-sage"
      />
      {children}
    </div>
  );
}

export function NeedsAttentionArea({
  data,
  degraded,
  mutedKeys,
  hiddenNavAreas,
}: {
  data: AdminDashboardData;
  // The dashboard read degraded to demo fallback; suppress the queue so its
  // counts and links are never mistaken for live work to do.
  degraded?: boolean;
  // "Needs attention" category keys a Super Admin has muted (launch optics):
  // each named category drops out of the queue entirely. Resolved server-side
  // from feature flags; an empty/undefined list mutes nothing.
  mutedKeys?: string[];
  // Top-level area hrefs hidden from nav (ADR 0016). When Groups is hidden the
  // Groups-bound actions (assign leaders / resolve setup gaps) drop out, since
  // their only destination is a retired tab. Omitted ⇒ gate nothing.
  hiddenNavAreas?: readonly string[];
}) {
  const actions = buildTopNextActions(data, {
    degraded,
    mutedKeys: mutedKeys ? new Set(mutedKeys) : undefined,
    hiddenNavAreas: hiddenNavAreas ? new Set(hiddenNavAreas) : undefined,
  });

  if (actions.length === 0) {
    return <AllClear>Nothing needs your attention right now.</AllClear>;
  }

  return (
    <div className="grid gap-2.5">
      <ol aria-label="Top next actions" className="m-0 grid gap-2 p-0">
        {actions.map(({ key, action, why, count, href, plus, tone }) => (
          <ActionRow
            key={key}
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
        <AllClear>Nothing else needs your attention right now.</AllClear>
      ) : null}
    </div>
  );
}
