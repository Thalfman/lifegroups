// Supabase Edge Function: manage-test-auth-users
//
// Runs in Deno on Supabase's trusted edge runtime. Holds the service-role
// key and uses it only after verifying the caller is an active
// `super_admin` profile (`diagnose` is the exception — see below).
//
// Actions:
//   status | enable | disable - require an active super_admin profile.
//   diagnose                  - any signed-in user. Returns a safe
//                               snapshot of the caller auth user id,
//                               profile-lookup outcome (including safe
//                               PostgREST error code/message/details/
//                               hint when it fails), and env presence
//                               by name. Used to troubleshoot why the
//                               role gate fails on the other actions.
//
// Never returns passwords, tokens, the service-role key, auth headers,
// or full env dumps. Errors are redacted of known secret values.

// deno-lint-ignore-file no-explicit-any
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  KNOWN_TEST_EMAILS,
  TEST_GROUP_SPECS,
  TEST_USER_SPECS,
  type TestUserSpec,
} from "./known-test-emails.ts";

type Action = "status" | "enable" | "disable" | "diagnose";

type UserSummary = {
  key: TestUserSpec["key"];
  email: string;
  role: string;
  authUser:
    | "exists"
    | "missing"
    | "created"
    | "updated"
    | "deleted"
    | "skipped";
  profile:
    | "active"
    | "inactive"
    | "missing"
    | "created"
    | "updated"
    | "skipped";
  groupAssignment: "active" | "inactive" | "none" | "added" | "deactivated";
  groupName: string | null;
  skipReason: string | null;
};

type GroupLeaderRow = {
  id: string;
  active: boolean;
  role: string;
  groups: { name: string } | null;
};

type GroupLeaderStatusRow = Pick<GroupLeaderRow, "active" | "role" | "groups">;
type GroupLeaderAssignmentRow = Pick<GroupLeaderRow, "id" | "active">;
type GroupsSummary = Record<
  "a" | "b",
  "exists" | "created" | "archived" | "missing"
>;

type PostgrestErrorPayload = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type DiagnosticsReport = {
  callerAuthUserId: string | null;
  profileLookup: {
    queried: boolean;
    succeeded: boolean;
    rowCount: number;
    profile?: {
      email: string | null;
      role: string | null;
      status: string | null;
    };
    postgrestError?: PostgrestErrorPayload;
  };
  envPresent: Record<string, boolean>;
};

// Surfaced on 409 duplicate_profiles_for_auth_user. `rowCountSeen` is
// bounded by the query's `.limit(2)` so the real count may be higher.
type DuplicateProfileInfo = {
  authUserId: string;
  rowCountSeen: number;
};

type ResponseBody = {
  ok: boolean;
  action: Action | "unknown";
  enabledOverall?: boolean;
  isRemoteSupabase?: boolean;
  // Optional structured-error fields. When `code` is set, callers should
  // prefer it over parsing the free-text `errors[]` strings. `missing`
  // lists secret NAMES only — never values.
  code?: string;
  message?: string;
  missing?: string[];
  postgrestError?: PostgrestErrorPayload;
  duplicateProfileInfo?: DuplicateProfileInfo;
  diagnostics?: DiagnosticsReport;
  summary: UserSummary[];
  groups: GroupsSummary;
  warnings: string[];
  errors: string[];
};

const REMOVABLE_ROLES = new Set(["ministry_admin", "leader", "co_leader"]);

const DEMO_SAFE_GROUP_NAMES: Record<"A" | "B", string[]> = {
  A: ["Northside Young Adults", "Westside Families", "TEST Life Group A"],
  B: ["Downtown Professionals", "Eastside Community", "TEST Life Group B"],
};

function isTruthyEnv(v: string | undefined): boolean {
  return v === "true";
}

// Lists missing required Edge Function secret NAMES for the given action.
// Returns an empty array when nothing is missing. Never returns values.
function listMissingEnv(
  action: Action,
  env: {
    supabaseUrl: string;
    serviceRoleKey: string;
    anonKey: string;
    enableFlag: boolean;
    passwords: Record<string, string>;
  }
): string[] {
  const missing: string[] = [];
  if (!env.supabaseUrl) missing.push("SUPABASE_URL");
  if (!env.serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!env.anonKey) missing.push("SUPABASE_ANON_KEY");
  if (action === "enable" || action === "disable") {
    if (!env.enableFlag) missing.push("ENABLE_TEST_AUTH_USERS");
  }
  if (action === "enable") {
    for (const name of [
      "TEST_ADMIN_PASSWORD",
      "TEST_LEADER1_PASSWORD",
      "TEST_LEADER2_PASSWORD",
      "TEST_COLEADER_PASSWORD",
    ]) {
      if (!env.passwords[name]) missing.push(name);
    }
  }
  return missing;
}

function classifyUrlIsRemote(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1")
      return false;
    if (host.endsWith(".supabase.internal")) return false;
    return true;
  } catch {
    return true;
  }
}

function buildSecretSet(env: {
  serviceRoleKey: string;
  passwords: string[];
}): Set<string> {
  const set = new Set<string>();
  if (env.serviceRoleKey) set.add(env.serviceRoleKey);
  for (const p of env.passwords) {
    if (p) set.add(p);
  }
  return set;
}

function redact(message: string, secrets: Set<string>): string {
  let out = message;
  for (const secret of secrets) {
    if (!secret) continue;
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), "[REDACTED]");
  }
  out = out.replace(
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    "[REDACTED_JWT]"
  );
  return out;
}

// Returns presence booleans for the env names this function expects.
// Never returns values. Safe to include in the response body.
// `enableTestAuthUsersRaw` is the RAW value of ENABLE_TEST_AUTH_USERS
// (any non-empty string counts as set) so an explicit "false" still
// reports as set — operators need to distinguish "not configured" from
// "configured to false".
function buildEnvPresence(env: {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  enableTestAuthUsersRaw: string;
  passwords: Record<string, string>;
}): Record<string, boolean> {
  return {
    SUPABASE_URL: env.supabaseUrl.length > 0,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey.length > 0,
    SUPABASE_ANON_KEY: env.anonKey.length > 0,
    ENABLE_TEST_AUTH_USERS: env.enableTestAuthUsersRaw.length > 0,
    TEST_ADMIN_PASSWORD: (env.passwords.TEST_ADMIN_PASSWORD ?? "").length > 0,
    TEST_LEADER1_PASSWORD:
      (env.passwords.TEST_LEADER1_PASSWORD ?? "").length > 0,
    TEST_LEADER2_PASSWORD:
      (env.passwords.TEST_LEADER2_PASSWORD ?? "").length > 0,
    TEST_COLEADER_PASSWORD:
      (env.passwords.TEST_COLEADER_PASSWORD ?? "").length > 0,
  };
}

// Runs each PostgREST diagnostic field through `redact()` defensively.
// PostgREST text rarely contains secrets, but applying redact is cheap.
function redactPostgrestError(
  pgErr:
    | { code?: string; message?: string; details?: string; hint?: string }
    | null
    | undefined,
  secrets: Set<string>
): PostgrestErrorPayload | undefined {
  if (!pgErr) return undefined;
  const safe: PostgrestErrorPayload = {};
  if (pgErr.code) safe.code = redact(String(pgErr.code), secrets);
  if (pgErr.message) safe.message = redact(String(pgErr.message), secrets);
  if (pgErr.details) safe.details = redact(String(pgErr.details), secrets);
  if (pgErr.hint) safe.hint = redact(String(pgErr.hint), secrets);
  return safe;
}

function jsonResponse(body: ResponseBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function emptyResponse(action: Action | "unknown"): ResponseBody {
  return {
    ok: false,
    action,
    summary: [],
    groups: { a: "missing", b: "missing" },
    warnings: [],
    errors: [],
  };
}

async function findAuthUserByEmail(
  client: SupabaseClient,
  email: string
): Promise<{ id: string; email: string | null } | null> {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error)
      throw new Error(`listUsers failed on page ${page}: ${error.message}`);
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return { id: match.id, email: match.email ?? null };
    if (users.length < perPage) return null;
    page += 1;
    if (page > 50) return null;
  }
}

async function resolveGroup(
  service: SupabaseClient,
  key: "A" | "B",
  createIfMissing: boolean
): Promise<{
  id: string;
  name: string;
  action: "exists" | "created" | "missing";
}> {
  const candidates = DEMO_SAFE_GROUP_NAMES[key];
  const { data, error } = await service
    .from("groups")
    .select("id, name, lifecycle_status")
    .in("name", candidates)
    .eq("lifecycle_status", "active");
  if (error)
    throw new Error(`groups lookup failed for ${key}: ${error.message}`);
  const rows = (data ?? []) as {
    id: string;
    name: string;
    lifecycle_status: string;
  }[];
  if (rows.length > 0) {
    const pick =
      rows.find((r) => r.name === TEST_GROUP_SPECS[key].name) ?? rows[0];
    return { id: pick.id, name: pick.name, action: "exists" };
  }
  if (!createIfMissing) {
    return { id: "", name: TEST_GROUP_SPECS[key].name, action: "missing" };
  }
  const spec = TEST_GROUP_SPECS[key];
  const { data: ins, error: insErr } = await service
    .from("groups")
    .insert({
      name: spec.name,
      meeting_day: spec.meeting_day,
      meeting_time: spec.meeting_time,
      meeting_frequency: spec.meeting_frequency,
      meeting_week_parity: spec.meeting_week_parity,
      lifecycle_status: spec.lifecycle_status,
      health_status: spec.health_status,
    })
    .select("id, name")
    .single();
  if (insErr)
    throw new Error(`group insert failed for ${key}: ${insErr.message}`);
  return { id: ins.id as string, name: ins.name as string, action: "created" };
}

async function handleStatus(
  service: SupabaseClient,
  isRemoteSupabase: boolean
): Promise<ResponseBody> {
  const out = emptyResponse("status");
  out.isRemoteSupabase = isRemoteSupabase;

  let allEnabled = true;
  for (const spec of TEST_USER_SPECS) {
    const row: UserSummary = {
      key: spec.key,
      email: spec.email,
      role: spec.role,
      authUser: "missing",
      profile: "missing",
      groupAssignment: spec.groupRole ? "none" : "none",
      groupName: null,
      skipReason: null,
    };
    try {
      const authUser = await findAuthUserByEmail(service, spec.email);
      row.authUser = authUser ? "exists" : "missing";
      if (!authUser) allEnabled = false;

      const { data: profile, error: pErr } = await service
        .from("profiles")
        .select("id, role, status, full_name")
        .eq("email", spec.email)
        .maybeSingle();
      if (pErr) throw new Error(`profile lookup failed: ${pErr.message}`);
      if (profile) {
        const p = profile as { id: string; role: string; status: string };
        row.profile = p.status === "active" ? "active" : "inactive";
        if (p.status !== "active") allEnabled = false;
        if (p.role !== spec.role) {
          row.skipReason = `current role '${p.role}' differs from expected '${spec.role}'`;
        }
        if (spec.groupRole) {
          const { data: glRow, error: glErr } = await service
            .from("group_leaders")
            .select("active, role, groups(name)")
            .eq("profile_id", p.id)
            .eq("role", spec.groupRole)
            .maybeSingle<GroupLeaderStatusRow>();
          if (glErr)
            throw new Error(`group_leaders lookup failed: ${glErr.message}`);
          if (glRow) {
            row.groupAssignment = glRow.active ? "active" : "inactive";
            row.groupName = glRow.groups?.name ?? null;
            if (!glRow.active) allEnabled = false;
          } else {
            row.groupAssignment = "none";
            allEnabled = false;
          }
        }
      } else {
        allEnabled = false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push(msg);
      allEnabled = false;
    }
    out.summary.push(row);
  }

  for (const key of ["A", "B"] as const) {
    try {
      const g = await resolveGroup(service, key, false);
      out.groups[key.toLowerCase() as "a" | "b"] =
        g.action === "missing" ? "missing" : "exists";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push(msg);
    }
  }

  out.enabledOverall = allEnabled;
  out.ok = out.errors.length === 0;
  return out;
}

async function handleEnable(
  service: SupabaseClient,
  passwords: Record<string, string>,
  isRemoteSupabase: boolean
): Promise<ResponseBody> {
  const out = emptyResponse("enable");
  out.isRemoteSupabase = isRemoteSupabase;

  const groupCache: Partial<
    Record<
      "A" | "B",
      { id: string; name: string; action: "exists" | "created" | "missing" }
    >
  > = {};

  for (const spec of TEST_USER_SPECS) {
    const row: UserSummary = {
      key: spec.key,
      email: spec.email,
      role: spec.role,
      authUser: "missing",
      profile: "missing",
      groupAssignment: spec.groupRole ? "none" : "none",
      groupName: null,
      skipReason: null,
    };

    try {
      const password = passwords[spec.passwordVar];
      if (!password) {
        row.authUser = "skipped";
        row.skipReason = `missing ${spec.passwordVar} on the Edge Function`;
        out.summary.push(row);
        continue;
      }

      const existing = await findAuthUserByEmail(service, spec.email);
      let authId: string;
      if (existing) {
        const { error } = await service.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
        });
        if (error) throw new Error(`updateUserById failed: ${error.message}`);
        authId = existing.id;
        row.authUser = "updated";
      } else {
        const { data, error } = await service.auth.admin.createUser({
          email: spec.email,
          password,
          email_confirm: true,
        });
        if (error) throw new Error(`createUser failed: ${error.message}`);
        if (!data?.user?.id) throw new Error("createUser returned no user id");
        authId = data.user.id;
        row.authUser = "created";
      }

      const { data: existingProfile, error: pErr } = await service
        .from("profiles")
        .select("id, role, status")
        .eq("email", spec.email)
        .maybeSingle();
      if (pErr) throw new Error(`profile lookup failed: ${pErr.message}`);

      let profileId: string;
      if (existingProfile) {
        const p = existingProfile as {
          id: string;
          role: string;
          status: string;
        };
        if (p.role === "super_admin") {
          row.profile = "skipped";
          row.skipReason = "refusing to overwrite super_admin profile";
          out.summary.push(row);
          continue;
        }
        const { error: updErr } = await service
          .from("profiles")
          .update({
            auth_user_id: authId,
            role: spec.role,
            status: "active",
            full_name: spec.fullName,
          })
          .eq("id", p.id);
        if (updErr) throw new Error(`profile update failed: ${updErr.message}`);
        profileId = p.id;
        row.profile = "updated";
      } else {
        const { data: ins, error: insErr } = await service
          .from("profiles")
          .insert({
            auth_user_id: authId,
            email: spec.email,
            full_name: spec.fullName,
            role: spec.role,
            status: "active",
          })
          .select("id")
          .single();
        if (insErr) throw new Error(`profile insert failed: ${insErr.message}`);
        profileId = ins.id as string;
        row.profile = "created";
      }

      if (spec.groupKey && spec.groupRole) {
        if (!groupCache[spec.groupKey]) {
          const g = await resolveGroup(service, spec.groupKey, true);
          groupCache[spec.groupKey] = g as {
            id: string;
            name: string;
            action: "exists" | "created";
          };
          out.groups[spec.groupKey.toLowerCase() as "a" | "b"] =
            g.action === "created" ? "created" : "exists";
        }
        const group = groupCache[spec.groupKey]!;
        row.groupName = group.name;

        const { data: glRow, error: glErr } = await service
          .from("group_leaders")
          .select("id, active")
          .eq("group_id", group.id)
          .eq("profile_id", profileId)
          .eq("role", spec.groupRole)
          .maybeSingle<GroupLeaderAssignmentRow>();
        if (glErr)
          throw new Error(`group_leaders lookup failed: ${glErr.message}`);
        if (glRow) {
          if (!glRow.active) {
            const { error: updErr } = await service
              .from("group_leaders")
              .update({ active: true })
              .eq("id", glRow.id);
            if (updErr)
              throw new Error(
                `group_leaders reactivate failed: ${updErr.message}`
              );
            row.groupAssignment = "added";
          } else {
            row.groupAssignment = "active";
          }
        } else {
          const { error: insErr } = await service.from("group_leaders").insert({
            group_id: group.id,
            profile_id: profileId,
            role: spec.groupRole,
            active: true,
          });
          if (insErr)
            throw new Error(`group_leaders insert failed: ${insErr.message}`);
          row.groupAssignment = "added";
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push(`[${spec.key}] ${msg}`);
    }
    out.summary.push(row);
  }

  out.ok = out.errors.length === 0;
  return out;
}

async function handleDisable(
  service: SupabaseClient,
  isRemoteSupabase: boolean
): Promise<ResponseBody> {
  const out = emptyResponse("disable");
  out.isRemoteSupabase = isRemoteSupabase;

  for (const spec of TEST_USER_SPECS) {
    const row: UserSummary = {
      key: spec.key,
      email: spec.email,
      role: spec.role,
      authUser: "missing",
      profile: "missing",
      groupAssignment: spec.groupRole ? "none" : "none",
      groupName: null,
      skipReason: null,
    };

    if (!(KNOWN_TEST_EMAILS as readonly string[]).includes(spec.email)) {
      row.authUser = "skipped";
      row.skipReason = "email not in KNOWN_TEST_EMAILS";
      out.summary.push(row);
      continue;
    }

    try {
      const authUser = await findAuthUserByEmail(service, spec.email);
      if (authUser) {
        const { error } = await service.auth.admin.deleteUser(authUser.id);
        if (error) throw new Error(`deleteUser failed: ${error.message}`);
        row.authUser = "deleted";
      } else {
        row.authUser = "missing";
      }

      const { data: profile, error: pErr } = await service
        .from("profiles")
        .select("id, role, status")
        .eq("email", spec.email)
        .maybeSingle();
      if (pErr) throw new Error(`profile lookup failed: ${pErr.message}`);
      const p = profile as { id: string; role: string; status: string } | null;
      if (!p) {
        row.profile = "missing";
        out.summary.push(row);
        continue;
      }
      if (p.role === "super_admin") {
        row.profile = "skipped";
        row.skipReason = "refusing to deactivate super_admin profile";
        out.summary.push(row);
        continue;
      }
      if (!REMOVABLE_ROLES.has(p.role)) {
        row.profile = "skipped";
        row.skipReason = `unexpected role '${p.role}'`;
        out.summary.push(row);
        continue;
      }

      const { error: glErr } = await service
        .from("group_leaders")
        .update({ active: false })
        .eq("profile_id", p.id);
      if (glErr)
        throw new Error(`group_leaders deactivate failed: ${glErr.message}`);
      row.groupAssignment = "deactivated";

      const { error: updErr } = await service
        .from("profiles")
        .update({ status: "inactive", auth_user_id: null })
        .eq("id", p.id)
        .in("role", Array.from(REMOVABLE_ROLES));
      if (updErr)
        throw new Error(`profile deactivate failed: ${updErr.message}`);
      row.profile = "inactive";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push(`[${spec.key}] ${msg}`);
    }
    out.summary.push(row);
  }

  for (const key of ["A", "B"] as const) {
    try {
      const name = TEST_GROUP_SPECS[key].name;
      const { data: rows, error } = await service
        .from("groups")
        .select("id, lifecycle_status")
        .eq("name", name);
      if (error)
        throw new Error(`groups lookup failed for ${name}: ${error.message}`);
      const matches = (rows ?? []) as {
        id: string;
        lifecycle_status: string;
      }[];
      const outKey = key.toLowerCase() as "a" | "b";
      if (matches.length === 0) {
        out.groups[outKey] = "missing";
        continue;
      }
      if (matches.length > 1) {
        out.warnings.push(
          `group[${name}]: ambiguous (${matches.length} rows); skipped archive`
        );
        out.groups[outKey] = "exists";
        continue;
      }
      const group = matches[0];
      const { data: leaders, error: lErr } = await service
        .from("group_leaders")
        .select("id")
        .eq("group_id", group.id)
        .eq("active", true);
      if (lErr)
        throw new Error(
          `group_leaders count failed for ${name}: ${lErr.message}`
        );
      if ((leaders ?? []).length > 0) {
        out.warnings.push(
          `group[${name}]: still has active leaders; skipped archive`
        );
        out.groups[outKey] = "exists";
        continue;
      }
      if (group.lifecycle_status === "closed") {
        out.groups[outKey] = "archived";
        continue;
      }
      const { error: updErr } = await service
        .from("groups")
        .update({
          lifecycle_status: "closed",
          closed_at: new Date().toISOString(),
        })
        .eq("id", group.id);
      if (updErr)
        throw new Error(`group archive failed for ${name}: ${updErr.message}`);
      out.groups[outKey] = "archived";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push(msg);
    }
  }

  out.ok = out.errors.length === 0;
  return out;
}

// deno-lint-ignore no-explicit-any
declare const Deno: {
  env: { get: (k: string) => string | undefined };
  serve: (handler: (req: Request) => Promise<Response> | Response) => any;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const passwords: Record<string, string> = {
    TEST_ADMIN_PASSWORD: Deno.env.get("TEST_ADMIN_PASSWORD") ?? "",
    TEST_LEADER1_PASSWORD: Deno.env.get("TEST_LEADER1_PASSWORD") ?? "",
    TEST_LEADER2_PASSWORD: Deno.env.get("TEST_LEADER2_PASSWORD") ?? "",
    TEST_COLEADER_PASSWORD: Deno.env.get("TEST_COLEADER_PASSWORD") ?? "",
  };

  const secrets = buildSecretSet({
    serviceRoleKey,
    passwords: Object.values(passwords),
  });
  const isRemoteSupabase = classifyUrlIsRemote(supabaseUrl);

  if (req.method !== "POST") {
    const body = emptyResponse("unknown");
    body.errors.push("method_not_allowed");
    return jsonResponse(body, 405);
  }

  const authHeader = req.headers.get("Authorization");
  const hasAuthHeader =
    authHeader?.toLowerCase().startsWith("bearer ") ?? false;
  if (!hasAuthHeader) {
    const body = emptyResponse("unknown");
    body.code = "missing_authorization_header";
    body.message = "Authorization header is missing or malformed.";
    body.errors.push("missing_authorization_header");
    return jsonResponse(body, 401);
  }

  let parsed: { action?: string } = {};
  try {
    parsed = (await req.json()) as { action?: string };
  } catch {
    const body = emptyResponse("unknown");
    body.errors.push("invalid_json_body");
    return jsonResponse(body, 400);
  }
  const action = parsed.action;
  if (
    action !== "status" &&
    action !== "enable" &&
    action !== "disable" &&
    action !== "diagnose"
  ) {
    const body = emptyResponse("unknown");
    body.errors.push("invalid_action");
    return jsonResponse(body, 400);
  }

  const enableTestAuthUsersRaw = Deno.env.get("ENABLE_TEST_AUTH_USERS") ?? "";
  const enableFlag = isTruthyEnv(enableTestAuthUsersRaw);
  const missingEnv = listMissingEnv(action, {
    supabaseUrl,
    serviceRoleKey,
    anonKey,
    enableFlag,
    passwords,
  });
  if (missingEnv.length > 0) {
    const body = emptyResponse(action);
    body.code = "missing_edge_function_env";
    body.message = "Missing required Edge Function configuration.";
    body.missing = missingEnv;
    body.errors.push("missing_edge_function_env");
    return jsonResponse(body, 500);
  }

  const anon = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader! } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let callerAuthId: string;
  try {
    const { data, error } = await anon.auth.getUser();
    if (error) throw new Error(error.message);
    if (!data?.user?.id) throw new Error("no_user");
    callerAuthId = data.user.id;
  } catch (err) {
    const body = emptyResponse(action);
    body.code = "invalid_or_expired_session";
    body.message = "Supabase Auth could not verify the bearer token.";
    body.errors.push("invalid_or_expired_session");
    body.errors.push(
      redact(err instanceof Error ? err.message : String(err), secrets)
    );
    return jsonResponse(body, 401);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Profile lookup uses the service-role client so the trusted Edge
  // Function can read the caller's profile row regardless of RLS. The
  // caller identity has already been proven by the verified JWT above.
  //
  // `.limit(2)` instead of `.maybeSingle()` so PostgREST does NOT throw
  // PGRST116 on duplicates; we get to distinguish zero / one / many rows
  // from a real query failure and surface safe details for each case.
  type ProfileLookupResult =
    | {
        kind: "ok";
        row: { id: string; email: string | null; role: string; status: string };
      }
    | { kind: "none" }
    | { kind: "duplicate"; count: number }
    | { kind: "error"; pg: PostgrestErrorPayload };

  async function lookupCallerProfile(): Promise<ProfileLookupResult> {
    const { data: rows, error } = await service
      .from("profiles")
      .select("id, email, role, status, auth_user_id")
      .eq("auth_user_id", callerAuthId)
      .limit(2);
    if (error) {
      const pg =
        redactPostgrestError(
          error as {
            code?: string;
            message?: string;
            details?: string;
            hint?: string;
          },
          secrets
        ) ?? {};
      return { kind: "error", pg };
    }
    const list = (rows ?? []) as Array<{
      id: string;
      email: string | null;
      role: string;
      status: string;
      auth_user_id: string | null;
    }>;
    if (list.length === 0) return { kind: "none" };
    if (list.length > 1) return { kind: "duplicate", count: list.length };
    const r = list[0];
    return {
      kind: "ok",
      row: { id: r.id, email: r.email, role: r.role, status: r.status },
    };
  }

  // Diagnose short-circuits the role gate so an operator can see what
  // the function actually observes. Any signed-in caller may invoke it.
  if (action === "diagnose") {
    const lookup = await lookupCallerProfile();
    const profileLookup: DiagnosticsReport["profileLookup"] = {
      queried: true,
      succeeded: lookup.kind !== "error",
      rowCount:
        lookup.kind === "ok"
          ? 1
          : lookup.kind === "duplicate"
            ? lookup.count
            : 0,
    };
    if (lookup.kind === "ok") {
      profileLookup.profile = {
        email: lookup.row.email,
        role: lookup.row.role,
        status: lookup.row.status,
      };
    }
    if (lookup.kind === "error") {
      profileLookup.postgrestError = lookup.pg;
    }

    console.log(
      JSON.stringify({
        event: "auth.diagnose",
        action,
        authUserId: callerAuthId,
        lookupKind: lookup.kind,
        rowCount: profileLookup.rowCount,
        pgCode: lookup.kind === "error" ? lookup.pg.code : undefined,
      })
    );

    const body = emptyResponse("diagnose");
    body.isRemoteSupabase = isRemoteSupabase;
    body.ok = true;
    body.code = "diagnose_ok";
    body.message =
      "Diagnostic snapshot of the Edge Function's view of the caller.";
    body.diagnostics = {
      callerAuthUserId: callerAuthId,
      profileLookup,
      envPresent: buildEnvPresence({
        supabaseUrl,
        serviceRoleKey,
        anonKey,
        enableTestAuthUsersRaw,
        passwords,
      }),
    };
    return jsonResponse(body, 200);
  }

  let profileRow: {
    id: string;
    email: string | null;
    role: string;
    status: string;
  };
  const lookup = await lookupCallerProfile();
  console.log(
    JSON.stringify({
      event: "auth.profile",
      action,
      authUserId: callerAuthId,
      lookupKind: lookup.kind,
      rowCount:
        lookup.kind === "ok"
          ? 1
          : lookup.kind === "duplicate"
            ? lookup.count
            : 0,
      pgCode: lookup.kind === "error" ? lookup.pg.code : undefined,
    })
  );

  if (lookup.kind === "error") {
    const body = emptyResponse(action);
    body.code = "profile_lookup_query_failed";
    body.message =
      "The Edge Function could not query profiles with the configured elevated key.";
    body.postgrestError = lookup.pg;
    body.errors.push("profile_lookup_query_failed");
    return jsonResponse(body, 500);
  }
  if (lookup.kind === "none") {
    const body = emptyResponse(action);
    body.code = "profile_not_found";
    body.message = "No app profile is linked to the signed-in auth user.";
    body.errors.push("profile_not_found");
    return jsonResponse(body, 403);
  }
  if (lookup.kind === "duplicate") {
    const body = emptyResponse(action);
    body.code = "duplicate_profiles_for_auth_user";
    body.message =
      "Multiple profile rows are linked to the signed-in auth user. " +
      "Resolve the duplicate before retrying.";
    body.duplicateProfileInfo = {
      authUserId: callerAuthId,
      rowCountSeen: lookup.count,
    };
    body.errors.push("duplicate_profiles_for_auth_user");
    return jsonResponse(body, 409);
  }
  profileRow = lookup.row;

  if (profileRow.status !== "active") {
    const body = emptyResponse(action);
    body.code = "profile_not_active";
    body.message = "The signed-in profile is not active.";
    body.errors.push("profile_not_active");
    return jsonResponse(body, 403);
  }
  if (profileRow.role !== "super_admin") {
    const body = emptyResponse(action);
    body.code = "super_admin_required";
    body.message = "Only super_admin profiles can manage test accounts.";
    body.errors.push("super_admin_required");
    return jsonResponse(body, 403);
  }

  try {
    let result: ResponseBody;
    if (action === "status") {
      result = await handleStatus(service, isRemoteSupabase);
    } else if (action === "enable") {
      result = await handleEnable(service, passwords, isRemoteSupabase);
    } else if (action === "disable") {
      result = await handleDisable(service, isRemoteSupabase);
    } else {
      // Unreachable: "diagnose" short-circuited above and the action
      // validator rejects anything else.
      const body = emptyResponse(action);
      body.errors.push("invalid_action");
      return jsonResponse(body, 400);
    }
    result.errors = result.errors.map((e) => redact(e, secrets));
    result.warnings = result.warnings.map((w) => redact(w, secrets));
    return jsonResponse(result, result.ok ? 200 : 207);
  } catch (err) {
    const body = emptyResponse(action);
    body.errors.push(
      redact(err instanceof Error ? err.message : String(err), secrets)
    );
    return jsonResponse(body, 500);
  }
});
