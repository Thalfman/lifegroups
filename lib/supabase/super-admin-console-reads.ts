import "server-only";

// Phase SAC.4 (#164): Super Admin Console coverage read models.
//
// Kept in a dedicated module (rather than appended to a broader read module)
// so the console's net-new reads are easy to find. These read the same
// shepherd_coverage_assignments / over_shepherds / profiles tables the
// over-shepherd surfaces already read; the console only adds a list view +
// the two pools the assign form draws from. No writes here.

import type {
  ProfilesRow,
  ShepherdCoverageAssignmentsRow,
  UsageEventsRow,
} from "@/types/database";
import { fetchProfileNamesByIds } from "./care-note-feed-reads";
import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

export type SuperAdminConsoleCoverageAssignment = {
  id: string;
  shepherd_profile_id: string;
  shepherd_name: string;
  over_shepherd_id: string;
  over_shepherd_name: string;
  assigned_at: string;
};

export type SuperAdminConsoleOverShepherd = {
  id: string;
  full_name: string;
};

export type SuperAdminConsoleCoverageLeader = {
  profile_id: string;
  full_name: string;
};

// Active over-shepherds, name-sorted, for the assign form's target pool.
// Returns ReadResult so a failed read is distinguishable from an empty pool
// (#899) — and so the reads seam's instrument() emits its read_unit failure
// line, which the old swallow-to-[] shape suppressed.
export async function fetchActiveOverShepherds(
  client: ReadClient
): Promise<ReadResult<SuperAdminConsoleOverShepherd[]>> {
  const { data, error } = await client
    .from("over_shepherds")
    .select("id, full_name")
    .eq("active", true)
    .order("full_name", { ascending: true });
  if (error)
    return { data: null, error: wrapError("fetchActiveOverShepherds", error) };
  return { data: (data ?? []) as SuperAdminConsoleOverShepherd[], error: null };
}

const SUPER_ADMIN_COVERAGE_LEADER_COLUMNS = columns<
  Pick<ProfilesRow, "id" | "full_name" | "role" | "status">
>()("id", "full_name", "role", "status");

// Active leader / co-leader profiles, the eligible coverage subjects.
export async function fetchCoverageAssignableLeaders(
  client: ReadClient
): Promise<ReadResult<SuperAdminConsoleCoverageLeader[]>> {
  const { data, error } = await client
    .from("profiles")
    .select(SUPER_ADMIN_COVERAGE_LEADER_COLUMNS.select)
    .in("role", ["leader", "co_leader"])
    .eq("status", "active")
    .order("full_name", { ascending: true });
  if (error)
    return {
      data: null,
      error: wrapError("fetchCoverageAssignableLeaders", error),
    };
  return {
    data: ((data ?? []) as Array<{ id: string; full_name: string }>).map(
      (row) => ({
        profile_id: row.id,
        full_name: row.full_name,
      })
    ),
    error: null,
  };
}

// Current (active) coverage assignments, with the shepherd + over-shepherd
// names resolved for display.
const SUPER_ADMIN_COVERAGE_ASSIGNMENT_COLUMNS = columns<
  Pick<
    ShepherdCoverageAssignmentsRow,
    "id" | "shepherd_profile_id" | "over_shepherd_id" | "assigned_at" | "active"
  >
>()("id", "shepherd_profile_id", "over_shepherd_id", "assigned_at", "active");

export async function fetchCurrentCoverageAssignments(
  client: ReadClient
): Promise<ReadResult<SuperAdminConsoleCoverageAssignment[]>> {
  const { data, error } = await client
    .from("shepherd_coverage_assignments")
    .select(SUPER_ADMIN_COVERAGE_ASSIGNMENT_COLUMNS.select)
    .eq("active", true)
    .order("assigned_at", { ascending: false });
  // Only the assignment-row read fails the result; the nested name lookups
  // below keep degrading to the "Unknown …" fallback labels.
  if (error)
    return {
      data: null,
      error: wrapError("fetchCurrentCoverageAssignments", error),
    };

  const rows = (data ?? []) as Array<{
    id: string;
    shepherd_profile_id: string;
    over_shepherd_id: string;
    assigned_at: string;
  }>;
  if (rows.length === 0) return { data: [], error: null };

  const shepherdIds = Array.from(
    new Set(rows.map((r) => r.shepherd_profile_id))
  );
  const overIds = Array.from(new Set(rows.map((r) => r.over_shepherd_id)));

  const [profileNamesRes, oversRes] = await Promise.all([
    fetchProfileNamesByIds(client, shepherdIds),
    client.from("over_shepherds").select("id, full_name").in("id", overIds),
  ]);

  // Degrades to an empty map (a missing name renders as the fallback label).
  const profileName = profileNamesRes.data ?? new Map<string, string>();
  const overName = new Map<string, string>();
  for (const o of (oversRes.data as Array<{
    id: string;
    full_name: string;
  }> | null) ?? []) {
    overName.set(o.id, o.full_name);
  }

  return {
    data: rows.map((r) => ({
      id: r.id,
      shepherd_profile_id: r.shepherd_profile_id,
      shepherd_name:
        profileName.get(r.shepherd_profile_id) ?? "Unknown shepherd",
      over_shepherd_id: r.over_shepherd_id,
      over_shepherd_name:
        overName.get(r.over_shepherd_id) ?? "Unknown over-shepherd",
      assigned_at: r.assigned_at,
    })),
    error: null,
  };
}

// Phase USAGE.1: read the recent usage_events for the Super Admin Console's
// Usage panel. usage_events is Super-Admin-only by RLS, so this read fails
// closed for every other role; the console only renders it for super_admin.
// Project only the columns the panel needs. usage_events holds user activity
// telemetry, so an explicit column list keeps any later schema addition from
// silently widening the console's read surface (vs. select("*")) — the same
// discipline fetchPlatformConfig applies to the Super-Admin config store.
const SUPER_ADMIN_USAGE_EVENT_COLUMNS = columns<UsageEventsRow>()(
  "id",
  "actor_profile_id",
  "event_type",
  "area",
  "created_at"
);

export async function fetchRecentUsageEvents(
  client: ReadClient,
  options: { limit?: number } = {}
): Promise<ReadResult<UsageEventsRow[]>> {
  const limit = options.limit ?? 200;
  const { data, error } = await client
    .from("usage_events")
    .select(SUPER_ADMIN_USAGE_EVENT_COLUMNS.select)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error)
    return { data: null, error: wrapError("fetchRecentUsageEvents", error) };
  return { data: data ?? [], error: null };
}
