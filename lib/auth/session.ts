import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfilesRow } from "@/types/database";
import type { UserRole } from "./roles";

export type CurrentSession = {
  authUser: { id: string; email: string | null };
  profile: ProfilesRow | null;
  assignedGroupIds: string[];
};

export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const profileQuery = await client
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const profile = profileQuery.data as ProfilesRow | null;

  if (!profile) {
    return {
      authUser: { id: user.id, email: user.email ?? null },
      profile: null,
      assignedGroupIds: [],
    };
  }

  let assignedGroupIds: string[] = [];
  if (profile.role === "leader" || profile.role === "co_leader") {
    const leaderRows = await client
      .from("group_leaders")
      .select("group_id")
      .eq("profile_id", profile.id)
      .eq("active", true);
    const rows = (leaderRows.data ?? []) as { group_id: string }[];
    assignedGroupIds = rows.map((row) => row.group_id);
  }

  return {
    authUser: { id: user.id, email: user.email ?? null },
    profile,
    assignedGroupIds,
  };
});

export async function requireRole(allowed: readonly UserRole[]): Promise<CurrentSession & { profile: ProfilesRow }> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/unauthorized");
  if (!allowed.includes(session.profile.role)) redirect("/unauthorized");
  return session as CurrentSession & { profile: ProfilesRow };
}

export const requireAdmin = () => requireRole(["super_admin", "ministry_admin"] as const);
export const requireAdminOrStaff = () =>
  requireRole(["super_admin", "ministry_admin", "staff_viewer"] as const);
export const requireLeader = () => requireRole(["leader", "co_leader"] as const);
