import type { ReadClient } from "@/lib/supabase/read-core";
import { churchTodayIso } from "@/lib/shared/church-time";
import { fetchActiveGroupCount } from "@/lib/supabase/group-reads";
import { fetchActiveMemberships } from "@/lib/supabase/membership-reads";
import { fetchOpenFollowUpsDueCount } from "@/lib/supabase/overview-reads";

// One at-a-glance figure on the Home Hub. Kept intentionally tiny — a label and
// a count — because the hub orients, it doesn't operate (the operating surfaces
// are one tile away).
export interface HubStat {
  label: string;
  value: number;
}

// At-a-glance live stats for the Home Hub (CONTEXT.md: the hub shows "navigation
// tiles plus at-a-glance live stats"). Deliberately resilient: each read runs
// independently via allSettled and a failure simply omits its stat — the hub
// never surfaces an error, matching the calm "soften, don't alarm" posture of
// the rest of these surfaces. Reuses the cheap, already-RLS-scoped read models
// the admin dashboard relies on, so no new query shapes are introduced.
export async function loadHubStats(client: ReadClient): Promise<HubStat[]> {
  const todayIso = churchTodayIso();
  const [groups, memberships, dueFollowUps] = await Promise.allSettled([
    fetchActiveGroupCount(client),
    fetchActiveMemberships(client),
    fetchOpenFollowUpsDueCount(client, { dueOnOrBeforeIso: todayIso }),
  ]);

  const stats: HubStat[] = [];

  const groupCount = fulfilled(groups)?.data;
  if (typeof groupCount === "number") {
    stats.push({ label: "Active groups", value: groupCount });
  }

  const members = fulfilled(memberships)?.data;
  if (members) {
    stats.push({ label: "People in groups", value: members.length });
  }

  const due = fulfilled(dueFollowUps)?.data;
  if (typeof due === "number") {
    stats.push({ label: "Follow-ups due", value: due });
  }

  return stats;
}

function fulfilled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}
