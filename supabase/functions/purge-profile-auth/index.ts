// Supabase Edge Function: purge-profile-auth
//
// Issue #881. A verified active Super Admin drives the existing transactional
// profile purge with the caller-scoped client, then this trusted runtime removes
// the linked Auth identity with the service-role client. The two systems cannot
// share a transaction: a retry therefore resumes from the profile tombstone and
// finishes the Auth deletion plus its idempotent audit envelope.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.0";

type LogLevel = "info" | "warn" | "error";
type AuthUserState = "deleted" | "already_missing" | "not_linked";
type ResponseBody = {
  ok: boolean;
  code: string;
  profileId?: string;
  tombstoneId?: string;
  authUserState?: AuthUserState;
  resumed?: boolean;
  warnings: string[];
  errors: string[];
  missing?: string[];
};
type CallerProfile = {
  id: string;
  role: string;
  status: string;
};
type TargetProfile = {
  id: string;
  auth_user_id: string | null;
  role: string;
};
type TombstoneRow = {
  id: string;
  row_snapshot: { auth_user_id?: unknown } | null;
};
type TargetResolution = {
  authUserId: string | null;
  tombstoneId: string;
  resumed: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function emptyResponse(code: string): ResponseBody {
  return { ok: false, code, warnings: [], errors: [code] };
}

function jsonResponse(body: ResponseBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    },
  });
}

function logJson(
  level: LogLevel,
  fields: Record<string, unknown> & { event: string; request_id: string }
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function elapsedSince(startMs: number): number {
  return Math.max(0, Date.now() - startMs);
}

function readProfileId(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return null;
  const value = (parsed as Record<string, unknown>).profileId;
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function snapshotAuthUserId(row: TombstoneRow): string | null {
  const value = row.row_snapshot?.auth_user_id;
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function isAuthUserMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
  };
  if (candidate.status === 404 || candidate.code === "user_not_found")
    return true;
  return (
    typeof candidate.message === "string" &&
    /user[^a-z]+not[^a-z]+found/i.test(candidate.message)
  );
}

function mapPurgeRpcError(message: string): { code: string; status: number } {
  for (const token of [
    "forbidden_target",
    "has_confidential_records",
    "has_blocking_dependents",
    "missing_entity",
    "invalid_input",
    "insufficient_privilege",
  ]) {
    if (message.includes(token)) {
      if (token === "insufficient_privilege") {
        return { code: "super_admin_required", status: 403 };
      }
      if (token === "missing_entity") return { code: token, status: 404 };
      if (token === "invalid_input") return { code: token, status: 400 };
      return { code: token, status: 409 };
    }
  }
  return { code: "db_purge_failed", status: 500 };
}

async function findCallerProfile(
  service: SupabaseClient,
  authUserId: string
): Promise<{ row: CallerProfile | null; duplicate: boolean; failed: boolean }> {
  const { data, error } = await service
    .from("profiles")
    .select("id, role, status")
    .eq("auth_user_id", authUserId)
    .limit(2);
  if (error) return { row: null, duplicate: false, failed: true };
  const rows = (data ?? []) as CallerProfile[];
  return {
    row: rows.length === 1 ? rows[0] : null,
    duplicate: rows.length > 1,
    failed: false,
  };
}

async function resolveTarget(
  service: SupabaseClient,
  callerClient: SupabaseClient,
  profileId: string,
  requestId: string,
  startMs: number,
  actorProfileId: string
): Promise<
  { ok: true; value: TargetResolution } | { ok: false; response: Response }
> {
  const { data: profileData, error: profileError } = await service
    .from("profiles")
    .select("id, auth_user_id, role")
    .eq("id", profileId)
    .limit(1);

  if (profileError) {
    logJson("error", {
      event: "profile_purge.failed",
      request_id: requestId,
      outcome: "fail",
      stage: "target_profile_lookup",
      error_code: "db_purge_failed",
      actor_profile_id: actorProfileId,
      target_profile_id: profileId,
      latency_ms: elapsedSince(startMs),
    });
    return {
      ok: false,
      response: jsonResponse(emptyResponse("db_purge_failed"), 500),
    };
  }

  const target = ((profileData ?? []) as TargetProfile[])[0] ?? null;
  if (target) {
    if (target.role === "super_admin") {
      return {
        ok: false,
        response: jsonResponse(emptyResponse("forbidden_target"), 409),
      };
    }

    const { data, error } = await callerClient.rpc(
      "super_admin_permanent_delete",
      {
        p_entity_type: "profile",
        p_id: profileId,
      }
    );
    if (error || typeof data !== "string" || !UUID_RE.test(data)) {
      const mapped = mapPurgeRpcError(error?.message ?? "rpc_no_data");
      logJson("error", {
        event: "profile_purge.failed",
        request_id: requestId,
        outcome: "fail",
        stage: "database_profile_purge",
        error_code: mapped.code,
        actor_profile_id: actorProfileId,
        target_profile_id: profileId,
        latency_ms: elapsedSince(startMs),
      });
      return {
        ok: false,
        response: jsonResponse(emptyResponse(mapped.code), mapped.status),
      };
    }

    return {
      ok: true,
      value: {
        authUserId: target.auth_user_id,
        tombstoneId: data,
        resumed: false,
      },
    };
  }

  // A previous attempt may have committed the DB purge before Auth deletion or
  // audit recording failed. Recover the trusted Auth id from the immutable
  // profile tombstone; never accept it from the caller.
  const { data: tombstoneData, error: tombstoneError } = await service
    .from("tombstones")
    .select("id, row_snapshot")
    .eq("entity_type", "profile")
    .eq("entity_id", profileId)
    .order("deleted_at", { ascending: false })
    .limit(1);
  if (tombstoneError) {
    return {
      ok: false,
      response: jsonResponse(emptyResponse("db_purge_failed"), 500),
    };
  }
  const tombstone = ((tombstoneData ?? []) as TombstoneRow[])[0] ?? null;
  if (!tombstone) {
    return {
      ok: false,
      response: jsonResponse(emptyResponse("missing_entity"), 404),
    };
  }

  return {
    ok: true,
    value: {
      authUserId: snapshotAuthUserId(tombstone),
      tombstoneId: tombstone.id,
      resumed: true,
    },
  };
}

Deno.serve(async (req: Request) => {
  const requestId = globalThis.crypto.randomUUID();
  const startMs = Date.now();

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }
  if (req.method !== "POST") {
    return jsonResponse(emptyResponse("method_not_allowed"), 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const missing: string[] = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    const body = emptyResponse("missing_edge_function_env");
    body.missing = missing;
    return jsonResponse(body, 500);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) {
    return jsonResponse(emptyResponse("missing_authorization_header"), 401);
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return jsonResponse(emptyResponse("invalid_json_body"), 400);
  }
  const profileId = readProfileId(parsed);
  if (!profileId) return jsonResponse(emptyResponse("invalid_payload"), 400);

  const anon = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await anon.auth.getUser();
  const caller = authData.user;
  if (authError || !caller) {
    return jsonResponse(emptyResponse("invalid_or_expired_session"), 401);
  }

  const lookup = await findCallerProfile(service, caller.id);
  if (lookup.failed) {
    return jsonResponse(emptyResponse("profile_lookup_failed"), 500);
  }
  if (lookup.duplicate) {
    return jsonResponse(emptyResponse("duplicate_profiles_for_auth_user"), 409);
  }
  const callerProfile = lookup.row;
  if (!callerProfile)
    return jsonResponse(emptyResponse("profile_not_found"), 403);
  if (callerProfile.status !== "active") {
    return jsonResponse(emptyResponse("profile_not_active"), 403);
  }
  if (callerProfile.role !== "super_admin") {
    return jsonResponse(emptyResponse("super_admin_required"), 403);
  }

  const callerClient = anon;
  const targetResult = await resolveTarget(
    service,
    callerClient,
    profileId,
    requestId,
    startMs,
    callerProfile.id
  );
  if (!targetResult.ok) return targetResult.response;

  const { authUserId, tombstoneId, resumed } = targetResult.value;
  let authUserState: AuthUserState = "not_linked";
  if (authUserId) {
    const { error: deleteError } = await service.auth.admin.deleteUser(
      authUserId,
      false
    );
    if (deleteError && !isAuthUserMissing(deleteError)) {
      logJson("error", {
        event: "profile_purge.partial_failure",
        request_id: requestId,
        outcome: "fail",
        stage: "auth_user_delete",
        error_code: "auth_delete_failed",
        actor_profile_id: callerProfile.id,
        target_profile_id: profileId,
        target_auth_user_id: authUserId,
        tombstone_id: tombstoneId,
        latency_ms: elapsedSince(startMs),
      });
      const body = emptyResponse("auth_delete_failed");
      body.profileId = profileId;
      body.tombstoneId = tombstoneId;
      body.warnings.push("database_profile_purge_completed");
      return jsonResponse(body, 502);
    }
    authUserState = deleteError ? "already_missing" : "deleted";
  }

  const { error: auditError } = await service.rpc(
    "service_record_profile_auth_purge",
    {
      p_actor_profile_id: callerProfile.id,
      p_profile_id: profileId,
      p_auth_user_id: authUserId,
      p_tombstone_id: tombstoneId,
      p_outcome: authUserState,
    }
  );
  if (auditError) {
    logJson("error", {
      event: "profile_purge.partial_failure",
      request_id: requestId,
      outcome: "fail",
      stage: "auth_delete_audit",
      error_code: "audit_record_failed",
      actor_profile_id: callerProfile.id,
      target_profile_id: profileId,
      target_auth_user_id: authUserId,
      tombstone_id: tombstoneId,
      latency_ms: elapsedSince(startMs),
    });
    const body = emptyResponse("audit_record_failed");
    body.profileId = profileId;
    body.tombstoneId = tombstoneId;
    body.warnings.push("auth_user_delete_completed");
    return jsonResponse(body, 500);
  }

  logJson("info", {
    event: "profile_purge.success",
    request_id: requestId,
    outcome: "ok",
    stage: "complete",
    actor_profile_id: callerProfile.id,
    target_profile_id: profileId,
    target_auth_user_id: authUserId,
    tombstone_id: tombstoneId,
    auth_user_state: authUserState,
    resumed,
    latency_ms: elapsedSince(startMs),
  });

  return jsonResponse(
    {
      ok: true,
      code: "ok",
      profileId,
      tombstoneId,
      authUserState,
      resumed,
      warnings: [],
      errors: [],
    },
    200
  );
});
