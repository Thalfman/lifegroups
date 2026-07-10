import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role Supabase access for the PLAYWRIGHT TEST PROCESS ONLY (#871/#872).
//
// SECURITY: this module is harness tooling, in the same spirit as
// tests/integration/support/clients.ts and scripts/seed-test-auth-users.ts.
// It reads the deliberately-renamed E2E_SERVICE_ROLE_KEY that scripts/e2e.sh
// exports (never SUPABASE_SERVICE_ROLE_KEY, which the seeded plumbing keeps
// inline-only), so the Next server Playwright builds/serves can never pick the
// key up under the name runtime code would look for — the repo invariant
// (no service-role key in the Next runtime) holds. It is imported ONLY by
// tests/e2e/*.spec.ts, never by anything under app/, lib/, or components/.
//
// Two jobs:
//   * fetchAuditEvents — read the audit_events rows the write RPCs pair with
//     each mutation, so the specs can assert the audit half of the pipeline
//     (the UI shows outcomes; the audit trail is only visible from the DB).
//   * ensureSuperAdmin — create-or-reuse a super_admin login for the invite
//     spec. The seed tooling (scripts/seed-test-auth-users.ts) deliberately
//     refuses to create a super_admin, so the spec provisions its own the way
//     tests/integration/support/fixtures.ts does: an Auth admin createUser +
//     a direct profiles row via the service client (fixture setup, not an app
//     write path).
//
// Like the integration harness, it REFUSES to talk to anything but a local
// stack: the lane creates throwaway users and reads audit rows, and must never
// touch a real project.

function hostIsLocal(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export type E2eDbEnv = {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
};

/**
 * Resolve the harness env, or null when it isn't configured (a bare
 * `npx playwright test` without scripts/e2e.sh) — specs skip cleanly on null.
 * A configured-but-non-local URL throws: that is a broken setup, not the
 * credential-free default, and silently skipping would hide it.
 */
export function e2eDbEnv(): E2eDbEnv | null {
  const supabaseUrl = (process.env.E2E_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.E2E_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) return null;
  if (!hostIsLocal(supabaseUrl)) {
    throw new Error(
      `E2E_SUPABASE_URL '${supabaseUrl}' is not a local stack. The E2E ` +
        `service-role helpers only ever target a local Supabase (localhost / ` +
        `127.0.0.1); refusing to run.`
    );
  }
  return { supabaseUrl, serviceRoleKey };
}

let cachedClient: SupabaseClient | null = null;

/**
 * The service-role client (fixture provisioning + audit reads only — every
 * behavioral assertion still runs through the real browser session). Throws
 * when the env is missing; call sites guard with e2eDbEnv() + test.skip first.
 */
export function e2eServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const env = e2eDbEnv();
  if (!env) {
    throw new Error(
      "E2E service-role env not configured (E2E_SUPABASE_URL + " +
        "E2E_SERVICE_ROLE_KEY, exported by scripts/e2e.sh)."
    );
  }
  cachedClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

// The audit-read column allowlist (repo invariant: named columns, never
// select("*")). Mirrors AUDIT_EVENT_COLUMNS in lib/supabase/follow-up-reads.ts
// — every AuditEventsRow column — restated literally here so this harness
// module stays free of app imports.
const AUDIT_EVENT_SELECT =
  "id, actor_profile_id, action, entity_type, entity_id, metadata, " +
  "created_at, actor_name, actor_email";

export type E2eAuditEventRow = {
  id: string;
  actor_profile_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
};

/**
 * Fetch audit_events rows for one action, newest first, optionally narrowed by
 * entity / actor / a created_at floor. The lane never wipes audit history (no
 * hard deletes, anywhere), so specs pass `since` (their start time) plus a
 * unique payload detail to isolate this run's rows on a persistent stack.
 */
export async function fetchAuditEvents(filter: {
  action: string;
  entityId?: string;
  actorProfileId?: string;
  since?: string;
}): Promise<E2eAuditEventRow[]> {
  const client = e2eServiceClient();
  let query = client
    .from("audit_events")
    .select(AUDIT_EVENT_SELECT)
    .eq("action", filter.action)
    .order("created_at", { ascending: false })
    .limit(50);
  if (filter.entityId) query = query.eq("entity_id", filter.entityId);
  if (filter.actorProfileId) {
    query = query.eq("actor_profile_id", filter.actorProfileId);
  }
  if (filter.since) query = query.gte("created_at", filter.since);
  const { data, error } = await query.returns<E2eAuditEventRow[]>();
  if (error) {
    throw new Error(
      `audit_events read failed for '${filter.action}': ${error.message}`
    );
  }
  return data ?? [];
}

export type E2eSuperAdmin = {
  readonly email: string;
  readonly password: string;
  readonly authUserId: string;
  readonly profileId: string;
};

async function findAuthUserIdByEmail(
  service: SupabaseClient,
  email: string
): Promise<string | null> {
  const wanted = email.toLowerCase();
  // The local stack holds a handful of seeded users plus this lane's
  // per-run signups; a few pages is ample.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      throw new Error(`auth listUsers failed: ${error.message}`);
    }
    const hit = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === wanted
    );
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * Create-or-reuse the E2E super_admin login (E2E_SUPER_ADMIN_EMAIL/_PASSWORD,
 * defaulted by scripts/e2e.sh). Idempotent against a persistent local stack:
 * an existing Auth user gets its password re-pinned, and the profiles row is
 * updated in place (create-or-update, never delete — mirroring the
 * no-hard-delete posture even for this local fixture).
 */
export async function ensureSuperAdmin(): Promise<E2eSuperAdmin> {
  const email =
    process.env.E2E_SUPER_ADMIN_EMAIL ?? "test.superadmin@lifegroups.local";
  const password =
    process.env.E2E_SUPER_ADMIN_PASSWORD ?? "route-smoke-superadmin-pw";
  const service = e2eServiceClient();

  // 1. Auth user: create, or on "already registered" look it up and re-pin
  //    the password so a stack seeded by an earlier run still signs in.
  let authUserId: string;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) {
    const existingId = await findAuthUserIdByEmail(service, email);
    if (!existingId) {
      throw new Error(
        `createUser failed for ${email}: ${created.error.message}`
      );
    }
    authUserId = existingId;
    const updated = await service.auth.admin.updateUserById(authUserId, {
      password,
    });
    if (updated.error) {
      throw new Error(
        `password re-pin failed for ${email}: ${updated.error.message}`
      );
    }
  } else {
    const id = created.data.user?.id;
    if (!id) throw new Error(`createUser returned no id for ${email}`);
    authUserId = id;
  }

  // 2. Profiles row: same column set tests/integration/support/fixtures.ts
  //    inserts; update-in-place when the email already has one.
  const { data: existingProfile, error: readError } = await service
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (readError) {
    throw new Error(`profiles read failed for ${email}: ${readError.message}`);
  }

  const profileFields = {
    auth_user_id: authUserId,
    email,
    full_name: "E2E Super Admin",
    role: "super_admin",
    status: "active",
  };

  if (existingProfile) {
    const { error } = await service
      .from("profiles")
      .update(profileFields)
      .eq("id", existingProfile.id);
    if (error) {
      throw new Error(`profile update failed for ${email}: ${error.message}`);
    }
    return { email, password, authUserId, profileId: existingProfile.id };
  }

  const { data, error } = await service
    .from("profiles")
    .insert(profileFields)
    .select("id")
    .single();
  if (error) {
    throw new Error(`profile insert failed for ${email}: ${error.message}`);
  }
  return { email, password, authUserId, profileId: data.id as string };
}
