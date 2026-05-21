import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfilesRow } from "@/types/database";
import { log } from "@/lib/observability/logger";
import { isLeaderRole, type UserRole } from "./roles";

export type AuthUser = { id: string; email: string | null };

// Discriminated union so callers can classify auth outcomes explicitly
// instead of collapsing transient backend failures into "no session" and
// surfacing them as user-facing 500s. Transitions:
//   anonymous       -> no Supabase auth user
//   authenticated   -> auth user + active profile row (status not enforced here)
//   profile_missing -> auth user exists, no profile row linked
//   backend_error   -> Supabase read failed (transient); guards return a
//                      controlled response instead of throwing.
export type SessionResult =
  | { kind: "anonymous" }
  | {
      kind: "authenticated";
      authUser: AuthUser;
      profile: ProfilesRow;
      assignedGroupIds: string[];
    }
  | { kind: "profile_missing"; authUser: AuthUser }
  | {
      kind: "backend_error";
      stage: "profile_lookup" | "leader_assignments";
      message: string;
    };

// Back-compat shape preserved for downstream readers that already know the
// session is authenticated. Always returned in {kind: "authenticated"} form.
export type CurrentSession = Extract<SessionResult, { kind: "authenticated" }>;

const TRANSIENT_ERROR_MESSAGE =
  "Service is temporarily unavailable. Please try again.";

export const getCurrentSession = cache(async (): Promise<SessionResult> => {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "anonymous" };

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { kind: "anonymous" };

  const authUser: AuthUser = { id: user.id, email: user.email ?? null };

  const profileQuery = await client
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (profileQuery.error) {
    log.error({
      event: "session_lookup_failed",
      outcome: "fail",
      stage: "profile_lookup",
      error_code: profileQuery.error.code ?? "unknown",
      error_message: profileQuery.error.message,
    });
    return {
      kind: "backend_error",
      stage: "profile_lookup",
      message: profileQuery.error.message,
    };
  }
  const profile = profileQuery.data as ProfilesRow | null;

  if (!profile) {
    return { kind: "profile_missing", authUser };
  }

  let assignedGroupIds: string[] = [];
  if (profile.role === "leader" || profile.role === "co_leader") {
    const leaderRows = await client
      .from("group_leaders")
      .select("group_id")
      .eq("profile_id", profile.id)
      .eq("active", true);
    if (leaderRows.error) {
      log.error({
        event: "session_lookup_failed",
        outcome: "fail",
        stage: "leader_assignments",
        actor_role: profile.role,
        error_code: leaderRows.error.code ?? "unknown",
        error_message: leaderRows.error.message,
      });
      return {
        kind: "backend_error",
        stage: "leader_assignments",
        message: leaderRows.error.message,
      };
    }
    const rows = (leaderRows.data ?? []) as { group_id: string }[];
    assignedGroupIds = rows.map((row) => row.group_id);
  }

  return { kind: "authenticated", authUser, profile, assignedGroupIds };
});

function logGuardBackendError(
  route_or_action: string,
  stage: "profile_lookup" | "leader_assignments",
): void {
  log.error({
    event: "auth_guard_backend_error",
    outcome: "fail",
    route_or_action,
    stage,
  });
}

export async function requireRole(
  allowed: readonly UserRole[],
): Promise<CurrentSession> {
  const session = await getCurrentSession();
  switch (session.kind) {
    case "anonymous":
      redirect("/login");
    case "profile_missing":
      redirect("/unauthorized");
    case "backend_error":
      logGuardBackendError("requireRole", session.stage);
      redirect("/unauthorized?reason=unavailable");
    case "authenticated":
      if (session.profile.status !== "active") redirect("/unauthorized");
      if (!allowed.includes(session.profile.role)) redirect("/unauthorized");
      return session;
  }
}

export const requireAdmin = () => requireRole(["super_admin", "ministry_admin"] as const);
export const requireSuperAdmin = () => requireRole(["super_admin"] as const);
export const requireLeader = () => requireRole(["leader", "co_leader"] as const);

// Server-action variant: instead of redirecting, returns a typed result the
// action can surface in the UI. Page routes still use requireAdmin() for
// the redirect behavior.
export async function requireAdminSession(): Promise<
  | { ok: true; session: CurrentSession }
  | { ok: false; error: string }
> {
  const session = await getCurrentSession();
  switch (session.kind) {
    case "anonymous":
      return { ok: false, error: "You need to sign in to do that." };
    case "profile_missing":
      return { ok: false, error: "Your account isn't set up yet." };
    case "backend_error":
      logGuardBackendError("requireAdminSession", session.stage);
      return { ok: false, error: TRANSIENT_ERROR_MESSAGE };
    case "authenticated": {
      if (session.profile.status !== "active")
        return { ok: false, error: "Your account isn't active." };
      if (
        session.profile.role !== "super_admin" &&
        session.profile.role !== "ministry_admin"
      )
        return { ok: false, error: "Only ministry admins can perform that action." };
      return { ok: true, session };
    }
  }
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
  switch (session.kind) {
    case "anonymous":
      return { ok: false, error: "You need to sign in to do that." };
    case "profile_missing":
      return { ok: false, error: "Your account isn't set up yet." };
    case "backend_error":
      logGuardBackendError("requireLeaderActor", session.stage);
      return { ok: false, error: TRANSIENT_ERROR_MESSAGE };
    case "authenticated": {
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
  }
}

// Server-action variant for the Phase 5A.3 super-admin-only console.
// Mirrors requireAdminSession() above but tightens the role check to
// super_admin alone, so role-management writes never accept a
// ministry_admin caller.
export async function requireSuperAdminSession(): Promise<
  | { ok: true; session: CurrentSession }
  | { ok: false; error: string }
> {
  const session = await getCurrentSession();
  switch (session.kind) {
    case "anonymous":
      return { ok: false, error: "You need to sign in to do that." };
    case "profile_missing":
      return { ok: false, error: "Your account isn't set up yet." };
    case "backend_error":
      logGuardBackendError("requireSuperAdminSession", session.stage);
      return { ok: false, error: TRANSIENT_ERROR_MESSAGE };
    case "authenticated": {
      if (session.profile.status !== "active")
        return { ok: false, error: "Your account isn't active." };
      if (session.profile.role !== "super_admin")
        return { ok: false, error: "Only the super admin can perform that action." };
      return { ok: true, session };
    }
  }
}
