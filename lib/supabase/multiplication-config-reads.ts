import type { GroupAudienceCategory } from "@/types/enums";
import { wrapError, type ReadClient, type ReadResult } from "./read-core";

// Multiplication Pillars config + funnel-volume read model (#380). Two reads feed
// the Multiply boards:
//   1. fetchMultiplicationConfigs — the per-(type, ministry-year) config rows
//      (thresholds + trigger + fed capacity), column-allowlisted. RLS already
//      restricts SELECT to admins (belt-and-braces, matching the health-rubric
//      reads idiom).
//   2. fetchFunnelVolumeByType — the Interest Funnel VOLUME per group type,
//      derived from active prospects whose matched/joined group is of that type.
//
// The config row's three jsonb columns are decoded into typed config at the trust
// boundary (lib/admin/multiplication-pillars.ts); the row type here stays raw.

export const MULTIPLICATION_CONFIG_COLUMNS =
  "id, group_type, ministry_year, thresholds, trigger_rubric, fed_capacity, updated_at";

// One persisted config row, as read through the allowlist. The three jsonb fields
// are raw; the caller decodes them with decodePillarThresholds / etc.
export type MultiplicationConfigRow = {
  id: string;
  group_type: GroupAudienceCategory;
  ministry_year: number;
  thresholds: unknown;
  trigger_rubric: unknown;
  fed_capacity: unknown;
  updated_at: string;
};

// Fetch all config rows for a ministry year (one per group type at most). An
// empty result is the success-with-empty case — a fresh ministry has no config
// until Julian sets it; the board falls back to built-in thresholds.
export async function fetchMultiplicationConfigs(
  client: ReadClient,
  ministryYear: number
): Promise<ReadResult<MultiplicationConfigRow[]>> {
  const { data, error } = await client
    .from("multiplication_config")
    .select(MULTIPLICATION_CONFIG_COLUMNS)
    .eq("ministry_year", ministryYear)
    .returns<MultiplicationConfigRow[]>();

  if (error)
    return {
      data: null,
      error: wrapError("multiplication_config", error),
    };
  return { data: data ?? [], error: null };
}

// ---------------------------------------------------------------------------
// Interest Funnel volume per group type.
// ---------------------------------------------------------------------------

// The funnel-volume read joins active (non-archived) prospects to their attached
// group's audience_category. A prospect with no group, or a group with no
// category, contributes to no type's volume (it isn't yet a type-specific signal).
type FunnelVolumeJoinRow = {
  id: string;
  archived: boolean;
  group: { audience_category: GroupAudienceCategory | null } | null;
};

const FUNNEL_VOLUME_COLUMNS = "id, archived, group:groups(audience_category)";
const FUNNEL_PAGE_LIMIT = 10000;

// Per-type Interest Funnel volume: the count of active prospects whose attached
// group is of each type. Drives the Interest pillar's input.
export type FunnelVolumeByType = Record<GroupAudienceCategory, number>;

export const EMPTY_FUNNEL_VOLUME: FunnelVolumeByType = {
  men: 0,
  women: 0,
  mixed: 0,
};

// Count active prospects per group type. Reads prospects + their group's audience
// category in one round-trip, then tallies in TS. Archived prospects (joined /
// parked-off-board) are excluded — the funnel volume is the LIVE interest signal.
export async function fetchFunnelVolumeByType(
  client: ReadClient
): Promise<ReadResult<FunnelVolumeByType>> {
  const { data, error } = await client
    .from("prospects")
    .select(FUNNEL_VOLUME_COLUMNS)
    .range(0, FUNNEL_PAGE_LIMIT - 1)
    .returns<FunnelVolumeJoinRow[]>();

  if (error)
    return { data: null, error: wrapError("fetchFunnelVolumeByType", error) };

  return { data: tallyFunnelVolume(data ?? []), error: null };
}

// Pure tally (exported for testing): count non-archived prospects per type.
export function tallyFunnelVolume(
  rows: FunnelVolumeJoinRow[]
): FunnelVolumeByType {
  const out: FunnelVolumeByType = { men: 0, women: 0, mixed: 0 };
  for (const row of rows) {
    if (row.archived) continue;
    const type = row.group?.audience_category ?? null;
    if (type === "men" || type === "women" || type === "mixed") {
      out[type] += 1;
    }
  }
  return out;
}
