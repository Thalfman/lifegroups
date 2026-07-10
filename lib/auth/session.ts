import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfilesRow } from "@/types/database";
import { log } from "@/lib/observability/logger";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { isUserRole, type UserRole } from "./roles";
import { isUuid } from "@/lib/shared/uuid";
import { columns } from "@/lib/supabase/read-core";
import { readFrozenSurfaceFlagForLeader } from "./leader-surface-flag";

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

// Trust-boundary guards. Validate the Supabase response shape before
// trusting it as a typed domain row — every page hits this code path,
// so a driver bug or schema drift should surface as a controlled
// backend_error rather than tunnelling through to role checks. UUID
// regex + user-role set are imported from their canonical sources so a
// future schema change only has to update one place.

const VALID_PROFILE_STATUSES = new Set(["active", "inactive", "invited"]);

// Column allowlist for the session profile read (#492). This read runs on
// every protected request, so it is the trust seam the allowlist invariant
// cares about most: name exactly the columns the session/role guards and
// downstream session consumers use — never select("*"). The list is typed
// against ProfilesRow so a renamed/removed column fails typecheck, and a
// colocated test pins the exact set so adding a profiles column can never
// silently widen this read. If a consumer legitimately needs a new column,
// add it here AND update the pinning test deliberately.
export const SESSION_PROFILE_COLUMNS = columns<ProfilesRow>()(
  "id", // primary key; actor identity for guards/actions
  "auth_user_id", // checked by the isProfilesRow trust-boundary guard
  "full_name", // rendered in shells/layouts from session.profile
  "full_name_pending", // choose-your-name gate: (protected)/layout + app/page (ADR 0032)
  "email", // rendered in shells/layouts from session.profile
  "role", // authorization: every role guard switches on this
  "status" // authorization: guards require "active"
);

function isProfilesRow(v: unknown): v is ProfilesRow {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (!isUuid(r.id)) return false;
  if (r.auth_user_id !== null && !isUuid(r.auth_user_id)) return false;
  if (!isUserRole(r.role)) return false;
  if (typeof r.status !== "string" || !VALID_PROFILE_STATUSES.has(r.status)) {
    return false;
  }
  if (typeof r.full_name_pending !== "boolean") return false;
  return true;
}

function isLeaderRowArray(v: unknown): v is { group_id: string }[] {
  if (!Array.isArray(v)) return false;
  return v.every((row) => {
    if (row === null || typeof row !== "object") return false;
    return isUuid((row as Record<string, unknown>).group_id);
  });
}

export const getCurrentSession = cache(async (): Promise<SessionResult> => {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "anonymous" };

  // Resolve the access-token claims first. getClaims() verifies the JWT locally
  // via the Web Crypto API on asymmetric-key projects (the default), so it is a
  // cheap local decode that yields the caller's user id (`sub`) WITHOUT an
  // auth-server round trip; it falls back to a getUser() network call only on
  // symmetric-key projects (never slower than getUser). Having `sub` up front
  // lets the authorization gate (getUser) and the profile read run CONCURRENTLY
  // below instead of in series — collapsing two sequential round-trips into one
  // and removing seconds from FCP on every protected request. We still need the
  // id to scope the profile read: profiles RLS lets an admin read every row, so
  // a bare select would not self-scope to the caller.
  const { data: claimsData } = await measureReadBundle(
    "session_get_claims",
    () => client.auth.getClaims()
  );
  const claimsSub = claimsData?.claims?.sub;
  if (!claimsSub || typeof claimsSub !== "string") {
    return { kind: "anonymous" };
  }

  // getUser() stays the authorization gate for every protected route: it
  // validates the access token against the Auth server on each request, so a
  // revoked/deleted Auth user is rejected immediately rather than lingering
  // until token expiry (a locally-verified JWT would keep admitting
  // requireAdmin()/requireLeader() callers — see PR #236 review). It now runs in
  // PARALLEL with the profile read keyed by the claims `sub`; the profile result
  // is trusted only once getUser confirms a live user just below, so a revoked
  // user is still fully rejected (fail-closed) — the read is simply discarded.
  const [userResult, profileQuery] = await Promise.all([
    measureReadBundle("session_get_user", () => client.auth.getUser()),
    measureReadBundle("session_profile", async () =>
      client
        .from("profiles")
        .select(SESSION_PROFILE_COLUMNS.select)
        .eq("auth_user_id", claimsSub)
        .maybeSingle()
    ),
  ]);

  const user = userResult.data.user;
  if (!user) return { kind: "anonymous" };

  const authUser: AuthUser = { id: user.id, email: user.email ?? null };

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
  const rawProfile: unknown = profileQuery.data;
  if (
    rawProfile !== null &&
    rawProfile !== undefined &&
    !isProfilesRow(rawProfile)
  ) {
    log.error({
      event: "session_lookup_failed",
      outcome: "fail",
      stage: "profile_lookup",
      error_code: "profile_shape_invalid",
    });
    return {
      kind: "backend_error",
      stage: "profile_lookup",
      message: "Profile row failed validation",
    };
  }
  // Cast is safe: rawProfile is either null/undefined or has been
  // structurally validated by isProfilesRow above. Supabase's
  // generated row type is intentionally incompatible with our
  // hand-rolled ProfilesRow (see lib/admin/rpc.ts file-level note),
  // so an explicit assertion after the runtime guard is required.
  // Note: the row carries only SESSION_PROFILE_COLUMNS at runtime — the
  // unselected ProfilesRow columns (phone, created_at, updated_at) have no
  // session consumer, and the pinning test keeps that contract explicit.
  const profile: ProfilesRow | null = (rawProfile ??
    null) as ProfilesRow | null;

  if (!profile) {
    return { kind: "profile_missing", authUser };
  }

  let assignedGroupIds: string[] = [];
  if (profile.role === "leader" || profile.role === "co_leader") {
    // Sequential by necessity, not an accidental waterfall: the read is keyed
    // by profile.id, which only exists once the profile read above resolves
    // (joining through profiles on auth_user_id would widen the RLS/allowlist
    // surface for no measured win). Instrumented so leader-session latency is
    // visible in the read_bundle drain like the sibling session reads.
    const leaderRows = await measureReadBundle(
      "session_leader_assignments",
      async () =>
        client
          .from("group_leaders")
          .select("group_id")
          .eq("profile_id", profile.id)
          .eq("active", true)
    );
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
    const leaderData: unknown = leaderRows.data ?? [];
    if (!isLeaderRowArray(leaderData)) {
      log.error({
        event: "session_lookup_failed",
        outcome: "fail",
        stage: "leader_assignments",
        actor_role: profile.role,
        error_code: "leader_rows_shape_invalid",
      });
      return {
        kind: "backend_error",
        stage: "leader_assignments",
        message: "Leader assignment rows failed validation",
      };
    }
    assignedGroupIds = leaderData.map((row) => row.group_id);
  }

  return { kind: "authenticated", authUser, profile, assignedGroupIds };
});

function logGuardBackendError(
  route_or_action: string,
  stage: "profile_lookup" | "leader_assignments"
): void {
  log.error({
    event: "auth_guard_backend_error",
    outcome: "fail",
    route_or_action,
    stage,
  });
}

// ── Guard core ───────────────────────────────────────────────────────────
// The oversight-ladder check itself, spelled once. Both guard tiers — the
// redirecting page guards and the result-returning action guards — used to
// re-spell the same five-branch ladder (anonymous / profile_missing /
// backend_error / inactive / role) and differed only in how they exited.
// The core resolves a verdict; the exit adapters below translate it
// (redirect() for pages, a typed SessionGuardResult for actions). A new
// tier or branch lands here once and both tiers pick it up.

type GuardDenialReason =
  | "anonymous"
  | "profile_missing"
  | "backend_error"
  | "inactive"
  | "role_not_allowed"
  | "surface_not_live";

type GuardVerdict =
  | { kind: "admit"; session: CurrentSession }
  | { kind: "deny"; reason: GuardDenialReason };

async function resolveGuardVerdict(options: {
  allowed: readonly UserRole[];
  // Keeps each named guard's log identity on a transient backend_error.
  label: string;
  // The Leader guards additionally require the `leader_surface` frozen flag
  // to resolve enabled+verified (ADR 0009/0017). Checked only after the role
  // admits, so the leader-safe RPC is never called for other tiers.
  requireLiveLeaderSurface?: boolean;
}): Promise<GuardVerdict> {
  const session = await getCurrentSession();
  switch (session.kind) {
    case "anonymous":
      return { kind: "deny", reason: "anonymous" };
    case "profile_missing":
      return { kind: "deny", reason: "profile_missing" };
    case "backend_error":
      logGuardBackendError(options.label, session.stage);
      return { kind: "deny", reason: "backend_error" };
    case "authenticated": {
      if (session.profile.status !== "active")
        return { kind: "deny", reason: "inactive" };
      if (!options.allowed.includes(session.profile.role))
        return { kind: "deny", reason: "role_not_allowed" };
      if (options.requireLiveLeaderSurface) {
        const live = await readFrozenSurfaceFlagForLeader("leader_surface");
        if (!live) return { kind: "deny", reason: "surface_not_live" };
      }
      return { kind: "admit", session };
    }
  }
}

// Page-route exit: any denial becomes the redirect the pre-core guards
// issued; only the backend_error reason carries a query hint.
function redirectExit(verdict: GuardVerdict): CurrentSession {
  if (verdict.kind === "admit") return verdict.session;
  switch (verdict.reason) {
    case "anonymous":
      redirect("/login");
    case "backend_error":
      redirect("/unauthorized?reason=unavailable");
    default:
      redirect("/unauthorized");
  }
}

export async function requireRole(
  allowed: readonly UserRole[]
): Promise<CurrentSession> {
  return redirectExit(
    await resolveGuardVerdict({ allowed, label: "requireRole" })
  );
}

export const requireAdmin = () =>
  requireRole(["super_admin", "ministry_admin"] as const);
export const requireSuperAdmin = () => requireRole(["super_admin"] as const);
// Over-Shepherd route-group guard per
// docs/adr/0002-oversight-ladder-and-leader-gating.md. Admits only
// over_shepherd; every other role (including admins and leaders) is
// redirected to /unauthorized, and over_shepherd cannot reach /admin/* or
// /leader/* because those guards never list it.
export const requireOverShepherd = () =>
  requireRole(["over_shepherd"] as const);
// Shepherd (leader) surface, re-opened under the verify-before-flip gate (#376,
// ADR 0017 amending ADR 0002 / under ADR 0009). Every /leader/* page calls this
// shared guard. It admits an active leader / co_leader ONLY when the
// `leader_surface` frozen-surface flag resolves enabled+verified — read through
// the leader-safe read_frozen_surface_flag RPC (the admin-only flag read can't
// be used from a leader context). The flag alone opens nothing: before this
// slice the guard admitted ZERO roles, so opening login is this deliberate guard
// change, not a side effect of the flag. Every OTHER role (admins, over_shepherd)
// stays no-access — they are redirected to /unauthorized — and a leader is too
// whenever the surface is not live, so the surface fails closed.
//
// Check-ins are NOT covered by this gate: /leader/[groupId]/checkin carries its
// own independent `check_ins` frozen gate (which stays off), so flipping
// leader_surface never exposes the check-in route/RPC.
export async function requireLeader(): Promise<CurrentSession> {
  // Only leader / co_leader can ever reach the surface — every other role is
  // no-access regardless of the flag — and only while leader_surface is
  // enabled-and-verified (ADR 0009).
  return redirectExit(
    await resolveGuardVerdict({
      allowed: ["leader", "co_leader"],
      label: "requireLeader",
      requireLiveLeaderSurface: true,
    })
  );
}

export type SessionGuardResult =
  | { ok: true; session: CurrentSession }
  | { ok: false; error: string };

// Server-action counterpart to requireRole: instead of redirecting, returns a
// typed result the action surfaces in the UI. Page routes still use the
// redirecting requireRole() family. One skeleton for every tier — the
// anonymous / profile_missing / backend_error / inactive branches are
// identical across guards, so the named guards below differ only in the
// admitted roles and the denial copy. `label` keeps each guard's existing
// log identity on a transient backend_error.
// Server-action exit: any denial becomes the typed error string the action
// surfaces in the UI. Role and surface denials share the guard's denyMessage.
function resultExit(
  verdict: GuardVerdict,
  denyMessage: string
): SessionGuardResult {
  if (verdict.kind === "admit") return { ok: true, session: verdict.session };
  switch (verdict.reason) {
    case "anonymous":
      return { ok: false, error: "You need to sign in to do that." };
    case "profile_missing":
      return { ok: false, error: "Your account isn't set up yet." };
    case "backend_error":
      return { ok: false, error: TRANSIENT_ERROR_MESSAGE };
    case "inactive":
      return { ok: false, error: "Your account isn't active." };
    case "role_not_allowed":
    case "surface_not_live":
      return { ok: false, error: denyMessage };
  }
}

async function requireRoleSession(
  allowed: readonly UserRole[],
  denyMessage: string,
  label: string
): Promise<SessionGuardResult> {
  return resultExit(await resolveGuardVerdict({ allowed, label }), denyMessage);
}

// Server-action variant: admits super_admin + ministry_admin. Used by default
// in runAdminWriteAction. Page routes still use requireAdmin() for redirects.
export const requireAdminSession = (): Promise<SessionGuardResult> =>
  requireRoleSession(
    ["super_admin", "ministry_admin"],
    "Only ministry admins can perform that action.",
    "requireAdminSession"
  );

// Server-action variant for leader workflows. Returns the actor's
// profile id + assigned group ids so callers can run a defense-in-depth
// group-membership check before hitting an RPC. Shared by Phase 5B.0
// check-in writes and Phase 5A.6 calendar writes.
export async function requireLeaderActor(): Promise<
  | { ok: true; profileId: string; assignedGroupIds: string[] }
  | { ok: false; error: string }
> {
  // Shepherd (leader) surface, re-opened under the verify-before-flip gate
  // (#376, ADR 0017 / 0009). Admit an active leader / co_leader only when
  // `leader_surface` resolves enabled+verified (leader-safe RPC). Every
  // other role, and any leader while the surface is not live, is denied
  // here before any RPC is reached. Co-Leaders get parity with Leaders.
  //
  // This guard backs ONLY non-check-in leader writes (e.g. calendar). The
  // check-in action stays behind its own `check_ins` frozen gate, so a live
  // leader_surface does not let leader_submit_group_checkin run.
  const result = resultExit(
    await resolveGuardVerdict({
      allowed: ["leader", "co_leader"],
      label: "requireLeaderActor",
      requireLiveLeaderSurface: true,
    }),
    "The shepherd surface isn't available."
  );
  if (!result.ok) return result;
  return {
    ok: true,
    profileId: result.session.profile.id,
    assignedGroupIds: result.session.assignedGroupIds,
  };
}

// Server-action variant for the Over-Shepherd surface (#126). Admits only an
// active over_shepherd, so the broad-note write never accepts an admin or
// leader caller. The coverage boundary itself is enforced in the SECURITY
// DEFINER RPC (auth_over_shepherd_covers); this gate only confirms the tier.
export const requireOverShepherdSession = (): Promise<SessionGuardResult> =>
  requireRoleSession(
    ["over_shepherd"],
    "Only an over-shepherd can perform that action.",
    "requireOverShepherdSession"
  );

// Server-action variant for writes shared by the Over-Shepherd and admin
// tiers (ADR 0023: Care Note / Prayer Request authorship). The per-subject
// boundary lives in the SECURITY DEFINER RPC — auth_is_admin() OR
// auth_over_shepherd_covers(subject) — so this gate only confirms the tier.
export const requireOverShepherdOrAdminSession =
  (): Promise<SessionGuardResult> =>
    requireRoleSession(
      ["over_shepherd", "ministry_admin", "super_admin"],
      "Only an over-shepherd or ministry admin can perform that action.",
      "requireOverShepherdOrAdminSession"
    );

// Server-action variant for the Phase 5A.3 super-admin-only console. Tightens
// the role check to super_admin alone, so role-management writes never accept
// a ministry_admin caller.
export const requireSuperAdminSession = (): Promise<SessionGuardResult> =>
  requireRoleSession(
    ["super_admin"],
    "Only the super admin can perform that action.",
    "requireSuperAdminSession"
  );
