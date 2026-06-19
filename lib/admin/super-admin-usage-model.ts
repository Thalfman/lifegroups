import {
  resolveFlag,
  type FeatureFlagsConfig,
} from "@/lib/admin/feature-flags";
import { formatStatusTime } from "@/lib/admin/super-admin-console-model";
import type { ProfilesRow, UsageEventsRow } from "@/types/database";

// Derived view for the Diagnostics "Usage & logins" panel: coarse telemetry
// (sign-ins + which top-level area each user opens), recorded only while the
// usage_tracking flag is on. Pure — the shell loads the recent usage_events +
// profile map and passes them in, so the tallies and empty-state branching are
// unit-testable without rendering.

// How many of the most-recent logins the panel lists.
const RECENT_LOGINS_LIMIT = 10;

// Prettify a usage area slug for display ("super-admin" -> "Super admin",
// "shepherd-care" -> "Shepherd care"). The first segment is capitalised, the
// rest stay lowercase and the hyphens become spaces — enough to read, without
// pretending to be a curated label.
export function labelForArea(slug: string): string {
  const spaced = slug.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type UsageAreaRow = {
  area: string;
  label: string;
  count: number;
  // Bar width relative to the busiest area (0–100).
  barPercent: number;
};

export type UsageRecentLogin = {
  id: string;
  name: string;
  // Pre-formatted via formatStatusTime; the panel appends " UTC".
  at: string;
};

export type UsagePersonRow = {
  // actor_profile_id of the person whose activity this row tallies.
  id: string;
  // Resolved from the profile map, else "Unknown" (e.g. a deleted actor).
  name: string;
  loginCount: number;
  areaViewCount: number;
  // Pre-formatted via formatStatusTime for this actor's newest event; the
  // panel appends " UTC".
  lastSeenAt: string;
};

export type UsagePanelModel = {
  // Resolved usage_tracking flag, so the panel can tell "off" apart from
  // "on but quiet".
  trackingOn: boolean;
  // Which empty-state message to show, or null when there are events to render.
  emptyState: "tracking-off" | "tracking-on" | null;
  loginCount: number;
  areaViewCount: number;
  // Distinct people seen across the loaded window (logins or area views).
  peopleSeenCount: number;
  // Area-view tally, busiest first (ties keep first-seen order).
  areaRows: UsageAreaRow[];
  // The latest logins, newest first (the read is already newest-first).
  recentLogins: UsageRecentLogin[];
  // Per-person activity, most active first (logins + area views), then by name.
  // Null-actor events can't be attributed, so they're excluded here.
  byPerson: UsagePersonRow[];
};

export function buildUsagePanelModel(input: {
  events: readonly UsageEventsRow[];
  profilesById: ReadonlyMap<string, Pick<ProfilesRow, "full_name">>;
  featureFlags: FeatureFlagsConfig;
}): UsagePanelModel {
  const { events, profilesById, featureFlags } = input;
  const trackingOn = resolveFlag(featureFlags, "usage_tracking");

  const logins = events.filter((e) => e.event_type === "login");
  const areaViews = events.filter((e) => e.event_type === "area_view");

  const activeActors = new Set(
    events.map((e) => e.actor_profile_id).filter((id): id is string => !!id)
  );

  const areaCounts = new Map<string, number>();
  for (const view of areaViews) {
    const area = view.area ?? "unknown";
    areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
  }
  const sortedAreas = [...areaCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxAreaCount = sortedAreas.length > 0 ? sortedAreas[0][1] : 0;

  // Per-person tally. Group every attributable event by its actor, counting
  // logins vs. area views and tracking each actor's newest event time. Compute
  // the latest timestamp explicitly rather than trusting input order, matching
  // how the rest of the model filters defensively.
  type PersonTally = {
    id: string;
    loginCount: number;
    areaViewCount: number;
    lastSeen: number;
  };
  const personTallies = new Map<string, PersonTally>();
  for (const e of events) {
    const actorId = e.actor_profile_id;
    if (!actorId) continue;
    const tally = personTallies.get(actorId) ?? {
      id: actorId,
      loginCount: 0,
      areaViewCount: 0,
      lastSeen: Number.NEGATIVE_INFINITY,
    };
    if (e.event_type === "login") tally.loginCount += 1;
    else if (e.event_type === "area_view") tally.areaViewCount += 1;
    const at = Date.parse(e.created_at);
    if (!Number.isNaN(at) && at > tally.lastSeen) tally.lastSeen = at;
    personTallies.set(actorId, tally);
  }
  const byPerson: UsagePersonRow[] = [...personTallies.values()]
    .map((t) => ({
      id: t.id,
      name: profilesById.get(t.id)?.full_name ?? "Unknown",
      loginCount: t.loginCount,
      areaViewCount: t.areaViewCount,
      lastSeenAt: formatStatusTime(
        t.lastSeen === Number.NEGATIVE_INFINITY
          ? new Date(0).toISOString()
          : new Date(t.lastSeen).toISOString()
      ),
    }))
    .sort((a, b) => {
      const totalA = a.loginCount + a.areaViewCount;
      const totalB = b.loginCount + b.areaViewCount;
      if (totalB !== totalA) return totalB - totalA;
      return a.name.localeCompare(b.name);
    });

  const recentLogins = logins.slice(0, RECENT_LOGINS_LIMIT).map((e) => {
    const actor = e.actor_profile_id
      ? profilesById.get(e.actor_profile_id)
      : null;
    return {
      id: e.id,
      name: actor?.full_name ?? "Unknown",
      at: formatStatusTime(e.created_at),
    };
  });

  return {
    trackingOn,
    emptyState:
      events.length > 0 ? null : trackingOn ? "tracking-on" : "tracking-off",
    loginCount: logins.length,
    areaViewCount: areaViews.length,
    peopleSeenCount: activeActors.size,
    areaRows: sortedAreas.map(([area, count]) => ({
      area,
      label: labelForArea(area),
      count,
      barPercent:
        maxAreaCount > 0 ? Math.round((count / maxAreaCount) * 100) : 0,
    })),
    recentLogins,
    byPerson,
  };
}
