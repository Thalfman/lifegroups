import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfilesRow } from "@/types/database";
import { isLeaderRole, type UserRole } from "./roles";

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
  if (profileQuery.error) {
    throw new Error(`Failed to load profile for session: ${profileQuery.error.message}`);
  }
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
    if (leaderRows.error) {
      throw new Error(`Failed to load leader assignments: ${leaderRows.error.message}`);
    }
    const rows = (leaderRows.data ?? []) as { group_id: string }[];
    assignedGroupIds = rows.map((row) => row.group_id);
  }

  return {
    authUser: { id: user.id, email: user.email ?? null },
    profile,
    assignedGroupIds,
  };
});

export async function requireRole(
  allowed: readonly UserRole[],
): Promise<CurrentSession & { profile: ProfilesRow }> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/unauthorized");
  if (session.profile.status !== "active") redirect("/unauthorized");
  if (!allowed.includes(session.profile.role)) redirect("/unauthorized");
  return session as CurrentSession & { profile: ProfilesRow };
}

export const requireAdmin = () => requireRole(["super_admin", "ministry_admin"] as const);
export const requireAdminOrStaff = () =>
  requireRole(["super_admin", "ministry_admin", "staff_viewer"] as const);
export const requireSuperAdmin = () => requireRole(["super_admin"] as const);
export const requireLeader = () => requireRole(["leader", "co_leader"] as const);

// Server-action variant: instead of redirecting, returns a typed result the
// action can surface in the UI. Page routes still use requireAdmin() for
// the redirect behavior.
export async function requireAdminSession(): Promise<
  | { ok: true; session: CurrentSession & { profile: ProfilesRow } }
  | { ok: false; error: string }
> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You need to sign in to do that." };
  if (!session.profile) return { ok: false, error: "Your account isn't set up yet." };
  if (session.profile.status !== "active")
    return { ok: false, error: "Your account isn't active." };
  if (session.profile.role !== "super_admin" && session.profile.role !== "ministry_admin")
    return { ok: false, error: "Only ministry admins can perform that action." };
  return { ok: true, session: session as CurrentSession & { profile: ProfilesRow } };
}

// Server-action variant for leader workflows. Returns the actor's
// profile id + assigned group ids so callers can run a defense-in-depth
// group-membership check before hitting an RPC. Shared by Phase 5B.0
// check-in writes and Phase 5A.6 calendar writes.
export async function requireLeaderActor(): Promise<
  | { ok: true; profileId: string; assignedGroupIds: string[] }
  | { ok: false; error: string }
> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You need to sign in to do that." };
  if (!session.profile) return { ok: false, error: "Your account isn't set up yet." };
  if (session.profile.status !== "active")
    return { ok: false, error: "Your account isn't active." };
  if (!isLeaderRole(session.profile.role))
    return {
      ok: false,
      error: "Only an assigned leader or co-leader can do that.",
    };
  return {
    ok: true,
    profileId: session.profile.id,
    assignedGroupIds: session.assignedGroupIds,
  };
}

// Server-action variant for the Phase 5A.3 super-admin-only console.
// Mirrors requireAdminSession() above but tightens the role check to
// super_admin alone, so role-management writes never accept a
// ministry_admin caller.
export async function requireSuperAdminSession(): Promise<
  | { ok: true; session: CurrentSession & { profile: ProfilesRow } }
  | { ok: false; error: string }
> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You need to sign in to do that." };
  if (!session.profile) return { ok: false, error: "Your account isn't set up yet." };
  if (session.profile.status !== "active")
    return { ok: false, error: "Your account isn't active." };
  if (session.profile.role !== "super_admin")
    return { ok: false, error: "Only the super admin can perform that action." };
  return { ok: true, session: session as CurrentSession & { profile: ProfilesRow } };
}
