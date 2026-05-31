// Phase SAC.4 (#164): Super Admin Console coverage read models.
//
// Kept in a dedicated module (rather than appended to the large read-models.ts)
// so the console's net-new reads are easy to find. These read the same
// shepherd_coverage_assignments / over_shepherds / profiles tables the
// over-shepherd surfaces already read; the console only adds a list view +
// the two pools the assign form draws from. No writes here.

import type { AppSupabaseClient } from "./types";

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
export async function fetchActiveOverShepherds(
  client: AppSupabaseClient
): Promise<SuperAdminConsoleOverShepherd[]> {
  const { data, error } = await client
    .from("over_shepherds")
    .select("id, full_name")
    .eq("active", true)
    .order("full_name", { ascending: true });
  if (error || !data) return [];
  return data as SuperAdminConsoleOverShepherd[];
}

// Active leader / co-leader profiles, the eligible coverage subjects.
export async function fetchCoverageAssignableLeaders(
  client: AppSupabaseClient
): Promise<SuperAdminConsoleCoverageLeader[]> {
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, role, status")
    .in("role", ["leader", "co_leader"])
    .eq("status", "active")
    .order("full_name", { ascending: true });
  if (error || !data) return [];
  return (data as Array<{ id: string; full_name: string }>).map((row) => ({
    profile_id: row.id,
    full_name: row.full_name,
  }));
}

// Current (active) coverage assignments, with the shepherd + over-shepherd
// names resolved for display.
export async function fetchCurrentCoverageAssignments(
  client: AppSupabaseClient
): Promise<SuperAdminConsoleCoverageAssignment[]> {
  const { data, error } = await client
    .from("shepherd_coverage_assignments")
    .select("id, shepherd_profile_id, over_shepherd_id, assigned_at, active")
    .eq("active", true)
    .order("assigned_at", { ascending: false });
  if (error || !data) return [];

  const rows = data as Array<{
    id: string;
    shepherd_profile_id: string;
    over_shepherd_id: string;
    assigned_at: string;
  }>;
  if (rows.length === 0) return [];

  const shepherdIds = Array.from(
    new Set(rows.map((r) => r.shepherd_profile_id))
  );
  const overIds = Array.from(new Set(rows.map((r) => r.over_shepherd_id)));

  const [profilesRes, oversRes] = await Promise.all([
    client.from("profiles").select("id, full_name").in("id", shepherdIds),
    client.from("over_shepherds").select("id, full_name").in("id", overIds),
  ]);

  const profileName = new Map<string, string>();
  for (const p of (profilesRes.data as Array<{
    id: string;
    full_name: string;
  }> | null) ?? []) {
    profileName.set(p.id, p.full_name);
  }
  const overName = new Map<string, string>();
  for (const o of (oversRes.data as Array<{
    id: string;
    full_name: string;
  }> | null) ?? []) {
    overName.set(o.id, o.full_name);
  }

  return rows.map((r) => ({
    id: r.id,
    shepherd_profile_id: r.shepherd_profile_id,
    shepherd_name: profileName.get(r.shepherd_profile_id) ?? "Unknown leader",
    over_shepherd_id: r.over_shepherd_id,
    over_shepherd_name:
      overName.get(r.over_shepherd_id) ?? "Unknown over-shepherd",
    assigned_at: r.assigned_at,
  }));
}
