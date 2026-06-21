// Supabase Edge Function: invite-user
//
// Backs the /admin/super-admin "Invite user" card. Runs in Deno on
// Supabase's trusted edge runtime. Holds the service-role key and uses
// it only after verifying the caller is an active super_admin profile.
//
// Flow:
//   1. Verify the caller's JWT (anon client) -> caller auth user id.
//   2. Look up the caller's profile via the service-role client; require
//      status='active' and role='super_admin'.
//   3. Validate the payload (email, role, optional phone, optional
//      group_id; group_id rejected for ministry_admin; optional delivery
//      'email' | 'link', default 'email'). No full_name: the invitee
//      chooses their own name at account setup (ADR 0025).
//   4. Resolve the Supabase Auth user by email; if missing, provision it:
//      delivery='email' -> `auth.admin.inviteUserByEmail` sends a real
//      invite email; delivery='link' -> `auth.admin.generateLink` returns
//      the invite action_link for the super_admin to share directly.
//   5. Call the SECURITY DEFINER RPC `super_admin_complete_invite` to
//      relink-or-insert the profile, optionally upsert group_leaders,
//      and write the audit_events row -- all in one transaction.
//
// On the delivery='link' path the invite `action_link` (a single-use
// credential) is returned in the success body to the verified super_admin
// caller only; it is never logged. Otherwise this function never returns
// passwords, tokens, the service-role key, auth headers, or full env
// dumps. Errors are redacted of known secret values.

// deno-lint-ignore-file no-explicit-any
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Defense-in-depth against the email-enumeration timing side channel between the
// "existing user" branch (paginated listUsers) and the "new user" branch
// (single inviteUserByEmail). The super-admin gate is the real access control;
// this pad just keeps a probe from distinguishing branches. Shared with
// redeem-invite so the floor/jitter can't drift between the two (audit SEC-3).
import { INVITE_TIMING_FLOOR_MS, padToFloor } from "../_shared/timing.ts";

// Minimal structured logger. Mirrors the field conventions in
// lib/observability/logger.ts but inlined here because Deno cannot resolve
// imports from the Next.js workspace (`@/lib/*`). Caller redacts message
// strings via the existing redact() helpers before passing them in.
type LogLevel = "info" | "warn" | "error";
type EdgeLogContext = {
  event: string;
  outcome?: "ok" | "fail" | "denied";
  request_id: string;
  latency_ms?: number;
  error_code?: string;
  [k: string]: unknown;
};
function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}
function logJson(level: LogLevel, ctx: EdgeLogContext): void {
  const payload = { ts: new Date().toISOString(), level, ...ctx };
  let line: string;
  try {
    line = JSON.stringify(payload);
  } catch {
    line = JSON.stringify({
      ts: payload.ts,
      level,
      event: ctx.event,
      _serialize_error: true,
    });
  }
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

type Role = "ministry_admin" | "over_shepherd" | "leader" | "co_leader";
type AuthUserState = "invited" | "existing_reused";
type GroupAssignmentState =
  | "none"
  | "created"
  | "reactivated"
  | "already_active";
type Delivery = "email" | "link";

type InvitePayload = {
  email: string;
  role: Role;
  phone: string | null;
  group_id: string | null;
  delivery: Delivery;
};

type PostgrestErrorPayload = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type DuplicateProfileInfo = {
  authUserId?: string;
  rowCountSeen: number;
};

type ResponseBody = {
  ok: boolean;
  code?: string;
  message?: string;
  profileId?: string;
  email?: string;
  role?: Role;
  authUserState?: AuthUserState;
  groupAssignmentState?: GroupAssignmentState;
  inviteLink?: string;
  warnings: string[];
  errors: string[];
  missing?: string[];
  postgrestError?: PostgrestErrorPayload;
  duplicateProfileInfo?: DuplicateProfileInfo;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(?=[^\d]*\d)[+0-9().\- ]{7,20}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The caller (verified super_admin server action) resolves the public site
// origin and passes the redirect target so this function doesn't depend on its
// own SITE_URL secret being set. The value becomes a link in an invite email,
// so constrain it: must be a well-formed http(s) URL whose path is exactly
// /reset-password. Supabase's Redirect URLs allow-list is the outer guard;
// this is defense against email-link injection / open redirect. Returns the
// normalized URL string when valid, otherwise null.
function validateCallerRedirect(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.pathname !== "/reset-password") return null;
  return url.toString();
}

function emptyResponse(): ResponseBody {
  return { ok: false, warnings: [], errors: [] };
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

function buildSecretSet(serviceRoleKey: string): Set<string> {
  const set = new Set<string>();
  if (serviceRoleKey) set.add(serviceRoleKey);
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

function redactPostgrestError(
  pgErr: PostgrestErrorPayload | null | undefined,
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

// Paginated search; returns the first matching auth user (case-insensitive).
// supabase-js v2.45's GoTrueAdminApi exposes `listUsers`, `getUserById`,
// `createUser`, `updateUserById`, `deleteUser`, and `inviteUserByEmail` --
// but NOT a direct `getUserByEmail`. Until that lands upstream we pull
// pages with the largest allowed `perPage` and bail when a partial page is
// returned (natural end-of-list). The hard page cap is intentionally high
// so it does not silently mask an existing user on a large tenant; a
// healthy tenant terminates via `users.length < perPage` long before the
// cap is reached.
async function findAuthUserByEmail(
  client: SupabaseClient,
  email: string
): Promise<{ id: string; email: string | null } | null> {
  const target = email.toLowerCase();
  const perPage = 200;
  const maxPages = 500; // 100k users with perPage=200
  for (let page = 1; page <= maxPages; page += 1) {
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
  }
  // Tenant exceeds maxPages -- surface as a failure rather than risk a
  // false-negative that would mis-route the flow into "invite new user".
  throw new Error(
    `listUsers exceeded ${maxPages} pages (perPage=${perPage}); could not confirm whether the email is already registered`
  );
}

type CallerProfileLookup =
  | {
      kind: "ok";
      row: { id: string; email: string | null; role: string; status: string };
    }
  | { kind: "none" }
  | { kind: "duplicate"; count: number }
  | { kind: "error"; pg: PostgrestErrorPayload };

async function lookupCallerProfile(
  service: SupabaseClient,
  callerAuthId: string,
  secrets: Set<string>
): Promise<CallerProfileLookup> {
  const { data: rows, error } = await service
    .from("profiles")
    .select("id, email, role, status, auth_user_id")
    .eq("auth_user_id", callerAuthId)
    .limit(2);
  if (error) {
    const pg =
      redactPostgrestError(error as PostgrestErrorPayload, secrets) ?? {};
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

function validatePayload(
  raw: unknown
): { ok: true; value: InvitePayload } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["payload must be an object"] };
  }
  const r = raw as Record<string, unknown>;

  const emailRaw =
    typeof r.email === "string" ? r.email.trim().toLowerCase() : "";
  if (emailRaw.length === 0) errors.push("email is required");
  else if (!EMAIL_RE.test(emailRaw))
    errors.push("email is not a valid address");

  const role = typeof r.role === "string" ? r.role : "";
  if (
    role !== "ministry_admin" &&
    role !== "over_shepherd" &&
    role !== "leader" &&
    role !== "co_leader"
  ) {
    errors.push(
      "role must be ministry_admin, over_shepherd, leader, or co_leader"
    );
  }

  let phone: string | null = null;
  if (r.phone !== undefined && r.phone !== null && r.phone !== "") {
    if (typeof r.phone !== "string") {
      errors.push("phone must be a string");
    } else {
      const trimmed = r.phone.trim();
      if (trimmed.length > 0) {
        if (!PHONE_RE.test(trimmed)) errors.push("phone format is invalid");
        else phone = trimmed;
      }
    }
  }

  let groupId: string | null = null;
  if (r.group_id !== undefined && r.group_id !== null && r.group_id !== "") {
    if (typeof r.group_id !== "string" || !UUID_RE.test(r.group_id)) {
      errors.push("group_id must be a uuid");
    } else {
      groupId = r.group_id.toLowerCase();
    }
  }

  if (
    (role === "ministry_admin" || role === "over_shepherd") &&
    groupId !== null
  ) {
    errors.push(`${role} profiles cannot be assigned to a group`);
  }

  // Optional delivery channel for the invite credential; defaults to the
  // historical email behavior. 'link' returns a copyable action_link instead.
  let delivery: Delivery = "email";
  if (r.delivery !== undefined && r.delivery !== null && r.delivery !== "") {
    if (r.delivery !== "email" && r.delivery !== "link") {
      errors.push("delivery must be 'email' or 'link'");
    } else {
      delivery = r.delivery;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      email: emailRaw,
      role: role as Role,
      phone,
      group_id: groupId,
      delivery,
    },
  };
}

// Maps a token raised by super_admin_complete_invite to (response code,
// HTTP status). Anything unknown becomes db_error / 500.
function mapRpcToken(message: string): { code: string; status: number } {
  if (message.includes("edge_function_only"))
    return { code: "edge_function_only", status: 500 };
  if (message.includes("invalid_actor"))
    return { code: "invalid_actor", status: 500 };
  if (message.includes("invalid_role"))
    return { code: "invalid_payload", status: 400 };
  if (message.includes("group_not_allowed_for_ministry_admin"))
    return { code: "invalid_payload", status: 400 };
  if (message.includes("invalid_input"))
    return { code: "invalid_payload", status: 400 };
  if (message.includes("forbidden_target"))
    return { code: "cannot_modify_super_admin_profile", status: 409 };
  if (message.includes("missing_group"))
    return { code: "missing_group", status: 422 };
  if (message.includes("profile_write_conflict"))
    return { code: "profile_write_conflict", status: 409 };
  return { code: "db_error", status: 500 };
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

  const requestId = newRequestId();
  const startMs = performance.now();
  const elapsed = (): number => Math.round(performance.now() - startMs);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const siteUrl = (
    Deno.env.get("SITE_URL") ??
    Deno.env.get("NEXT_PUBLIC_SITE_URL") ??
    ""
  ).replace(/\/+$/, "");
  const secrets = buildSecretSet(serviceRoleKey);

  if (req.method !== "POST") {
    logJson("warn", {
      event: "invite.method_not_allowed",
      outcome: "denied",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: "method_not_allowed",
      http_method: req.method,
    });
    const body = emptyResponse();
    body.code = "method_not_allowed";
    body.errors.push("method_not_allowed");
    return jsonResponse(body, 405);
  }

  logJson("info", {
    event: "invite.attempt",
    request_id: requestId,
    caller_present:
      req.headers.get("Authorization")?.toLowerCase().startsWith("bearer ") ??
      false,
  });

  const missing: string[] = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY");
  if (missing.length > 0) {
    logJson("error", {
      event: "invite.misconfigured",
      outcome: "fail",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: "missing_edge_function_env",
      missing_count: missing.length,
    });
    const body = emptyResponse();
    body.code = "missing_edge_function_env";
    body.message = "Missing required Edge Function configuration.";
    body.missing = missing;
    body.errors.push("missing_edge_function_env");
    return jsonResponse(body, 500);
  }

  const authHeader = req.headers.get("Authorization");
  const hasAuthHeader =
    authHeader?.toLowerCase().startsWith("bearer ") ?? false;
  if (!hasAuthHeader) {
    logJson("warn", {
      event: "invite.unauthorized",
      outcome: "denied",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: "missing_authorization_header",
    });
    const body = emptyResponse();
    body.code = "missing_authorization_header";
    body.message = "Authorization header is missing or malformed.";
    body.errors.push("missing_authorization_header");
    return jsonResponse(body, 401);
  }

  let parsed: unknown = null;
  try {
    parsed = await req.json();
  } catch {
    logJson("warn", {
      event: "invite.validation_failed",
      outcome: "fail",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: "invalid_json_body",
    });
    const body = emptyResponse();
    body.code = "invalid_json_body";
    body.errors.push("invalid_json_body");
    return jsonResponse(body, 400);
  }

  // Caller JWT verification.
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
    logJson("warn", {
      event: "invite.unauthorized",
      outcome: "denied",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: "invalid_or_expired_session",
    });
    const body = emptyResponse();
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

  // Caller profile lookup (super_admin gate).
  const lookup = await lookupCallerProfile(service, callerAuthId, secrets);
  if (lookup.kind === "error") {
    logJson("error", {
      event: "invite.profile_lookup_failed",
      outcome: "fail",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: "profile_lookup_query_failed",
      pg_code: lookup.pg.code,
    });
    const body = emptyResponse();
    body.code = "profile_lookup_query_failed";
    body.message =
      "The Edge Function could not query profiles with the configured elevated key.";
    body.postgrestError = lookup.pg;
    body.errors.push("profile_lookup_query_failed");
    return jsonResponse(body, 500);
  }
  if (lookup.kind === "none") {
    logJson("warn", {
      event: "invite.unauthorized",
      outcome: "denied",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: "profile_not_found",
    });
    const body = emptyResponse();
    body.code = "profile_not_found";
    body.errors.push("profile_not_found");
    return jsonResponse(body, 403);
  }
  if (lookup.kind === "duplicate") {
    logJson("error", {
      event: "invite.profile_lookup_failed",
      outcome: "fail",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: "duplicate_profiles_for_auth_user",
      row_count: lookup.count,
    });
    const body = emptyResponse();
    body.code = "duplicate_profiles_for_auth_user";
    body.duplicateProfileInfo = {
      authUserId: callerAuthId,
      rowCountSeen: lookup.count,
    };
    body.errors.push("duplicate_profiles_for_auth_user");
    return jsonResponse(body, 409);
  }
  const callerProfile = lookup.row;
  if (callerProfile.status !== "active") {
    logJson("warn", {
      event: "invite.unauthorized",
      outcome: "denied",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: "profile_not_active",
      actor_profile_id: callerProfile.id,
    });
    const body = emptyResponse();
    body.code = "profile_not_active";
    body.errors.push("profile_not_active");
    return jsonResponse(body, 403);
  }
  if (callerProfile.role !== "super_admin") {
    logJson("warn", {
      event: "invite.unauthorized",
      outcome: "denied",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: "super_admin_required",
      actor_profile_id: callerProfile.id,
      actor_role: callerProfile.role,
    });
    const body = emptyResponse();
    body.code = "super_admin_required";
    body.errors.push("super_admin_required");
    return jsonResponse(body, 403);
  }

  // Payload validation.
  const v = validatePayload(parsed);
  if (!v.ok) {
    logJson("warn", {
      event: "invite.validation_failed",
      outcome: "fail",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: "invalid_payload",
      actor_profile_id: callerProfile.id,
      error_count: v.errors.length,
    });
    const body = emptyResponse();
    body.code = "invalid_payload";
    body.errors.push("invalid_payload", ...v.errors);
    return jsonResponse(body, 400);
  }
  const payload = v.value;
  const target_email_domain = emailDomain(payload.email);

  // Prefer the caller-provided redirect (resolved in the Next.js runtime where
  // the site URL is configured); fall back to this function's own SITE_URL env.
  const callerRedirect = validateCallerRedirect(
    (parsed as Record<string, unknown>)?.redirect_to
  );
  const resolvedRedirect =
    callerRedirect ?? (siteUrl ? `${siteUrl}/reset-password` : undefined);

  // Auth user resolve / invite.
  let authId: string;
  let authUserState: AuthUserState;
  // Populated only on the delivery='link' new-user path; surfaced to the
  // verified super_admin in the success body and never logged.
  let inviteLink: string | undefined;
  try {
    const existingAuth = await findAuthUserByEmail(service, payload.email);
    if (existingAuth) {
      // New-users-only: an already-registered login gets no invite link.
      authId = existingAuth.id;
      authUserState = "existing_reused";
    } else if (payload.delivery === "link") {
      const { data, error } = await service.auth.admin.generateLink({
        type: "invite",
        email: payload.email,
        options: {
          redirectTo: resolvedRedirect,
        },
      });
      if (error || !data?.user?.id) {
        logJson("error", {
          event: "invite.rpc_failed",
          outcome: "fail",
          request_id: requestId,
          latency_ms: elapsed(),
          error_code: "invite_failed",
          stage: "auth_admin_generate_link",
          actor_profile_id: callerProfile.id,
          target_email_domain,
          target_role: payload.role,
        });
        const body = emptyResponse();
        body.code = "invite_failed";
        body.errors.push("invite_failed");
        if (error) body.errors.push(redact(error.message, secrets));
        return jsonResponse(body, 500);
      }
      authId = data.user.id;
      authUserState = "invited";
      inviteLink = data.properties?.action_link ?? undefined;
    } else {
      const { data, error } = await service.auth.admin.inviteUserByEmail(
        payload.email,
        {
          redirectTo: resolvedRedirect,
        }
      );
      if (error || !data?.user?.id) {
        logJson("error", {
          event: "invite.rpc_failed",
          outcome: "fail",
          request_id: requestId,
          latency_ms: elapsed(),
          error_code: "invite_failed",
          stage: "auth_admin_invite",
          actor_profile_id: callerProfile.id,
          target_email_domain,
          target_role: payload.role,
        });
        const body = emptyResponse();
        body.code = "invite_failed";
        body.errors.push("invite_failed");
        if (error) body.errors.push(redact(error.message, secrets));
        return jsonResponse(body, 500);
      }
      authId = data.user.id;
      authUserState = "invited";
    }
  } catch (err) {
    logJson("error", {
      event: "invite.rpc_failed",
      outcome: "fail",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: "invite_failed",
      stage: "auth_resolve",
      actor_profile_id: callerProfile.id,
      target_email_domain,
      target_role: payload.role,
      error_message: redact(
        err instanceof Error ? err.message : String(err),
        secrets
      ),
    });
    const body = emptyResponse();
    body.code = "invite_failed";
    body.errors.push("invite_failed");
    body.errors.push(
      redact(err instanceof Error ? err.message : String(err), secrets)
    );
    return jsonResponse(body, 500);
  }

  // Level wall-clock timing between the "existing user" (paginated
  // listUsers) and "new user" (single inviteUserByEmail) branches before
  // we issue the RPC so the response time can't be used to enumerate
  // which emails are already registered.
  await padToFloor(startMs, INVITE_TIMING_FLOOR_MS);

  // Single atomic RPC: profile upsert + group_leaders + audit, one txn.
  // No p_full_name (optional, ignored server-side): the invitee chooses
  // their own name at account setup (ADR 0025).
  const { data: rpcData, error: rpcErr } = await service.rpc(
    "super_admin_complete_invite",
    {
      p_actor_profile_id: callerProfile.id,
      p_auth_user_id: authId,
      p_email: payload.email,
      p_role: payload.role,
      p_phone: payload.phone,
      p_group_id: payload.group_id,
      p_auth_user_state: authUserState,
    }
  );

  if (rpcErr) {
    const mapped = mapRpcToken(rpcErr.message ?? "");
    logJson("error", {
      event: "invite.rpc_failed",
      outcome: "fail",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: mapped.code,
      stage: "super_admin_complete_invite",
      actor_profile_id: callerProfile.id,
      target_email_domain,
      target_role: payload.role,
      auth_user_state: authUserState,
      pg_code: (rpcErr as PostgrestErrorPayload).code,
    });
    const body = emptyResponse();
    body.code = mapped.code;
    body.errors.push(mapped.code);
    body.errors.push(redact(rpcErr.message ?? "rpc failed", secrets));
    body.postgrestError = redactPostgrestError(
      rpcErr as PostgrestErrorPayload,
      secrets
    );
    // The auth user may have been created above; surface that to the
    // operator so they know retry is safe and will reuse it.
    if (authUserState === "invited") {
      body.warnings.push(
        "Supabase Auth user was created before the DB write failed; a retry with the same email will reuse it."
      );
    }
    return jsonResponse(body, mapped.status);
  }

  const rpcResult = (rpcData ?? {}) as {
    profile_id?: string;
    group_assignment_state?: GroupAssignmentState;
  };
  if (!rpcResult.profile_id) {
    logJson("error", {
      event: "invite.rpc_failed",
      outcome: "fail",
      request_id: requestId,
      latency_ms: elapsed(),
      error_code: "rpc_no_data",
      stage: "super_admin_complete_invite",
      actor_profile_id: callerProfile.id,
    });
    const body = emptyResponse();
    body.code = "db_error";
    body.errors.push("db_error", "RPC returned no profile id");
    return jsonResponse(body, 500);
  }

  logJson("info", {
    event: "invite.success",
    outcome: "ok",
    request_id: requestId,
    latency_ms: elapsed(),
    actor_profile_id: callerProfile.id,
    target_email_domain,
    target_role: payload.role,
    auth_user_state: authUserState,
    group_assignment_state: rpcResult.group_assignment_state ?? "none",
    new_profile_id: rpcResult.profile_id,
  });

  const body: ResponseBody = {
    ok: true,
    code: "ok",
    profileId: rpcResult.profile_id,
    email: payload.email,
    role: payload.role,
    authUserState,
    groupAssignmentState: rpcResult.group_assignment_state ?? "none",
    warnings: [],
    errors: [],
  };
  // Credential — present only on the delivery='link' new-user path. Returned
  // to the verified super_admin; deliberately absent from all log lines.
  if (inviteLink) body.inviteLink = inviteLink;
  return jsonResponse(body, 200);
});
