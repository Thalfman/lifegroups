import type { AdminDashboardData } from "@/lib/dashboard/types";

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
export function buildNeedsAttentionItems(
  data: AdminDashboardData
): NeedsAttentionItem[] {
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
      href: "/admin/shepherd-care?filter=needs_attention",
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

  return candidates.filter((c) => c.count > 0);
}
