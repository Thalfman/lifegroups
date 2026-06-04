import type { AdminDashboardData } from "@/lib/dashboard/types";
import { buildShepherdCareTriageLink } from "@/lib/admin/shepherd-care-view";

// Dashboard "Needs attention" area derivation (Admin Interaction Model PRD
// req 7, #260). Kept as a pure function in lib/ — apart from the rendering in
// components/lg/admin/dashboard/NeedsAttentionArea.tsx — so the category and
// threshold rules are unit-testable on their own.

export type NeedsAttentionItem = {
  key: string;
  // The admin concern, phrased as a thing that needs attention.
  label: string;
  count: number;
  href: string;
  // True when the underlying read is capped, so the count renders as "N+"
  // (a minimum) rather than overstating an exact figure.
  plus?: boolean;
  tone: NeedsAttentionTone;
};

// The accent the count renders in. Resolved to a concrete colour at render time
// so this module stays free of the palette (and of React).
export type NeedsAttentionTone = "primary" | "warning";

// Returns only the categories that currently have something to act on, in a
// stable priority-ish order. An empty array means all clear.
//
// Rules baked in (req 7):
//   - Only categories with a real action (count > 0) are returned; a zero-count
//     concern is not a "needs attention" item, so it is omitted, never padded.
//   - Frozen/deferred workflows (e.g. the guest pipeline) are absent by
//     construction — they are never surfaced here as imperative action links.
//   - A read that degraded (e.g. the leader-care summary) contributes 0 rather
//     than a misleading count, so a transient error never shows as work to do.
//   - When the whole dashboard read degraded (`degraded`), every count here is
//     demo fallback data (ADMIN_FALLBACK), not a live figure — so the area
//     contributes nothing rather than fabricate imperative actions from the
//     demo seed. (The deliberate no-client demo preview is *not* degraded and
//     still showcases its items.)
export function buildNeedsAttentionItems(
  data: AdminDashboardData,
  options: { degraded?: boolean; mutedKeys?: ReadonlySet<string> } = {}
): NeedsAttentionItem[] {
  if (options.degraded) return [];

  const gaps = data.setupGaps.counts;
  const health = data.healthSummary.counts;
  const care = data.shepherdCare;

  // Setup gaps excludes "no leader": that concern is surfaced on its own as the
  // unassigned-groups action, so it is not double-counted here.
  const otherSetupGaps =
    gaps.noCapacity + gaps.noMeetingDayTime + gaps.noMembers;

  const candidates: NeedsAttentionItem[] = [
    {
      key: "no_leader",
      label: "Groups without a leader",
      count: gaps.noLeader,
      href: "/admin/groups",
      tone: "primary",
    },
    {
      key: "care_attention",
      label: "Leaders needing care attention",
      count: care.available ? care.needsAttention : 0,
      // The directory applies the needs_attention filter only in its directory
      // view; an absent `view` resolves to the (unfiltered) dashboard. Use the
      // shared triage-link builder so the tile lands on the *filtered directory*
      // (`view=directory&filter=needs_attention`), where the admin can act,
      // rather than bouncing back to the scan dashboard.
      href: buildShepherdCareTriageLink({ kind: "needs_attention" }),
      tone: "primary",
    },
    {
      key: "health",
      label: "Overdue or missing health checks",
      count: health.missing + health.needs_follow_up,
      href: "/admin/group-health",
      tone: "warning",
    },
    {
      key: "follow_ups",
      label: "Open follow-ups",
      count: data.followUps.length,
      href: "/admin/follow-ups",
      // The open-follow-ups read is capped, so present a full page as "N+".
      plus: data.followUps.length >= 8,
      tone: "primary",
    },
    {
      key: "setup_gaps",
      label: "Setup gaps",
      count: otherSetupGaps,
      href: "/admin/groups",
      tone: "warning",
    },
  ];

  // Drop any Super-Admin-muted categories (launch-optics mutes, #260 follow-up).
  // Muting suppresses a time-based category from the queue entirely; only the
  // three time-based keys are ever mutable, so no_leader / setup_gaps are
  // unaffected regardless of what is passed.
  const muted = options.mutedKeys;
  return candidates.filter((c) => c.count > 0 && !(muted?.has(c.key) ?? false));
}

// Ranked "Top next actions" queue (Admin Interaction Model PRD req 8, #271).
//
// Layers a single ranked, imperative list on top of the minimal Needs-attention
// area (#260). It reuses every derivation rule from buildNeedsAttentionItems
// (count > 0 only, frozen workflows excluded, degraded → nothing, the capped
// follow-ups "N+") and adds two things the P1 queue owns:
//   1. a FIXED cross-category priority order, and
//   2. imperative "do this next" phrasing with the live count folded in.
//
// Director sign-off (#271, Open Question 1, confirmed 2026-06-03):
//   - Order is most-foundational → least: leaders → setup → care/health →
//     follow-ups. A group with no leader blocks everything downstream; setup
//     gaps block it from meeting; then care/health; then follow-ups.
//   - The order is FIXED regardless of counts — "Assign leaders" outranks
//     "health checks" even when there is 1 unassigned group vs 20 overdue
//     checks. Counts drive the phrasing and the per-row number, not the rank.
//   - Zero-count categories drop out (identical to #260) — the queue holds
//     actions, not per-category reassurance rows. An empty queue is the single
//     consolidated "all clear" state, owned by the renderer.
export type TopNextAction = NeedsAttentionItem & {
  // The concern phrased as an imperative action with the live count folded in,
  // e.g. "Assign leaders to 16 groups", "Resolve 8 setup gaps".
  action: string;
  // A one-line "why it matters" rationale, static per category (NO count, NO
  // query) so the admin learns why now, not only what and how many. Calm and
  // pastoral, never alarmist — secondary context rendered under the action.
  why: string;
};

// Static per-category rationale ("why it matters"). Keyed by category `key`,
// derived purely — never references the live count. Tone is calm and pastoral
// (req #323): it explains the cost of leaving the work undone without alarm.
const TOP_ACTION_WHY: Record<string, string> = {
  no_leader: "Unled groups can't meet or grow.",
  setup_gaps: "Missing details keep a group from gathering well.",
  care_attention: "Leaders carry more when no one is checking in.",
  health: "Regular checks keep a group's health from drifting unseen.",
  follow_ups: "Follow-ups close the loop on care already begun.",
};

// A calm fallback for any category without a specific rationale, so an unknown
// key still carries a non-empty, non-alarmist "why".
const DEFAULT_WHY = "Tending this keeps your groups healthy.";

function whyItMatters(item: NeedsAttentionItem): string {
  return TOP_ACTION_WHY[item.key] ?? DEFAULT_WHY;
}

// Fixed category rank (lower = more urgent). Care sits with health per the
// sign-off rationale ("then care/health"). Any key absent here sorts last.
const TOP_ACTION_RANK: Record<string, number> = {
  no_leader: 0,
  setup_gaps: 1,
  care_attention: 2,
  health: 3,
  follow_ups: 4,
};

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function imperativeAction(item: NeedsAttentionItem): string {
  const n = item.count;
  switch (item.key) {
    case "no_leader":
      return `Assign ${plural(n, "a leader", "leaders")} to ${n} ${plural(n, "group", "groups")}`;
    case "setup_gaps":
      // count sums noCapacity + noMeetingDayTime + noMembers, so it is a count
      // of gaps (one group can contribute several), not a count of groups.
      return `Resolve ${n} setup ${plural(n, "gap", "gaps")}`;
    case "care_attention":
      return `Reach out to ${n} ${plural(n, "leader", "leaders")} needing care`;
    case "health":
      // count = missing + needs_follow_up; "missing" checks were never done, so
      // they are not "overdue" — mirror the #260 "overdue or missing" wording.
      return `Review ${n} overdue or missing health ${plural(n, "check", "checks")}`;
    case "follow_ups":
      return `Resolve ${n}${item.plus ? "+" : ""} open ${plural(n, "follow-up", "follow-ups")}`;
    default:
      return `${item.label}: ${n}${item.plus ? "+" : ""}`;
  }
}

export function buildTopNextActions(
  data: AdminDashboardData,
  options: { degraded?: boolean; mutedKeys?: ReadonlySet<string> } = {}
): TopNextAction[] {
  return buildNeedsAttentionItems(data, options)
    .map((item) => ({
      ...item,
      action: imperativeAction(item),
      why: whyItMatters(item),
    }))
    .sort(
      (a, b) =>
        (TOP_ACTION_RANK[a.key] ?? Number.MAX_SAFE_INTEGER) -
        (TOP_ACTION_RANK[b.key] ?? Number.MAX_SAFE_INTEGER)
    );
}
