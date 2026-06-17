"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import {
  type ActionResult,
  actionFail,
  actionOk,
} from "@/lib/admin/action-result";
import {
  buildErrorLines,
  extractErrorBody,
  makeMapFnError,
  makeTokenForStatus,
  redact,
} from "@/lib/admin/edge-fn-error";

const REVALIDATE_PATH = "/admin/super-admin";

export type TestAccountUserRow = {
  key: "admin" | "leader1" | "leader2" | "coleader";
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

export type PostgrestErrorPayload = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export type DuplicateProfileInfo = {
  authUserId: string;
  rowCountSeen: number;
};

export type DiagnosticsReport = {
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

export type TestAccountsResponse = {
  ok: boolean;
  action: "status" | "enable" | "disable" | "diagnose" | "unknown";
  enabledOverall?: boolean;
  isRemoteSupabase?: boolean;
  code?: string;
  message?: string;
  missing?: string[];
  postgrestError?: PostgrestErrorPayload;
  duplicateProfileInfo?: DuplicateProfileInfo;
  diagnostics?: DiagnosticsReport;
  summary: TestAccountUserRow[];
  groups: Record<"a" | "b", "exists" | "created" | "archived" | "missing">;
  warnings: string[];
  errors: string[];
};

// Token → safe human message. Tokens come either from the Edge Function's
// own `code`/`errors[]` strings or are synthesized client-side from HTTP
// status when no structured body is available.
const FN_ERROR_MESSAGES: Record<string, string> = {
  // Pre-flight env check (HTTP 500).
  missing_edge_function_env:
    "Edge Function secrets are missing. Add them in Supabase Dashboard → Edge Functions → manage-test-auth-users → Secrets, then redeploy or retry.",
  // Legacy/runtime configuration error (HTTP 500). Kept for older deploys.
  function_not_configured:
    "The test-accounts Edge Function is missing required environment variables. Set its secrets and redeploy.",
  // Auth-header / session problems (HTTP 401).
  missing_authorization_header:
    "Your session token didn't reach the Edge Function. Sign out, sign back in, and retry.",
  missing_or_invalid_session:
    "Your session is missing or invalid. Sign out and back in, then retry.",
  invalid_or_expired_session:
    "Your Supabase session is invalid or expired. Sign out and back in, then retry.",
  // Legacy token kept for rolling deploys of older Edge Function versions.
  unauthorized:
    "Your session is no longer valid. Sign out and back in, then retry.",
  // Role-gate problems (HTTP 403).
  profile_not_found:
    "Your auth user has no linked app profile. Ask an existing super admin to create one.",
  profile_not_active:
    "Your app profile is not active. Ask an existing super admin to reactivate it.",
  super_admin_required: "Only the super admin can manage test accounts.",
  // Legacy token kept for rolling deploys of older Edge Function versions.
  forbidden: "Only the super admin can manage test accounts.",
  authorization_check_failed:
    "The Edge Function hit a runtime error while checking your role. See Supabase function logs for event:auth.profile to identify the cause.",
  profile_lookup_query_failed:
    "The Edge Function could not query the profiles table with its elevated key. The PostgREST diagnostics below identify the underlying cause (RLS denial, malformed query, or other Postgres-side error).",
  duplicate_profiles_for_auth_user:
    "Multiple app profiles are linked to the same auth user. Open the Supabase Studio profiles table, find the rows with that auth_user_id, and remove or relink the duplicate.",
  diagnose_ok: "Diagnostic snapshot retrieved.",
  // Disabled flag (HTTP 403/500 depending on path; the new pre-flight
  // surfaces this via `missing_edge_function_env` with
  // `ENABLE_TEST_AUTH_USERS` in `missing[]`).
  test_auth_users_disabled:
    "Test accounts are disabled on this deployment. Set ENABLE_TEST_AUTH_USERS=true on the Edge Function and redeploy.",
  // Routing / deploy problems (HTTP 404).
  function_not_deployed_or_wrong_name:
    "The Edge Function isn't deployed or the name is wrong. Run: supabase functions deploy manage-test-auth-users.",
  // Request shape problems (HTTP 400/405).
  invalid_json_body: "Internal error: the request body wasn't valid JSON.",
  invalid_action: "Internal error: unrecognized action.",
  method_not_allowed: "Internal error: wrong HTTP method.",
  // Generic runtime failure (HTTP 500).
  test_account_seed_failed:
    "The Edge Function ran but couldn't finish the seed. See per-row errors below or check the Supabase function logs.",
};

const mapFnError = makeMapFnError(FN_ERROR_MESSAGES);

// Synthesize a token from HTTP status when no structured body is
// available (e.g. infra-level 404 from the gateway, or unparseable body).
const tokenForStatus = makeTokenForStatus({
  unauthorized: "missing_or_invalid_session",
  forbidden: "super_admin_required",
  notFound: "function_not_deployed_or_wrong_name",
  serverError: "test_account_seed_failed",
  fallback: "unknown_error",
});

async function callEdgeFn(
  action: "status" | "enable" | "disable" | "diagnose"
): Promise<ActionResult<TestAccountsResponse>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const client = await createSupabaseServerClient();
  if (!client)
    return actionFail(["The database is not configured on this deployment."]);

  const { data, error } = await client.functions.invoke<TestAccountsResponse>(
    "manage-test-auth-users",
    { body: { action } }
  );

  if (error) {
    const { status, body } =
      await extractErrorBody<TestAccountsResponse>(error);
    const code = body?.code ?? body?.errors?.[0] ?? tokenForStatus(status);
    return actionFail(
      buildErrorLines({
        status,
        code,
        mapFnError,
        messages: FN_ERROR_MESSAGES,
        missing: body?.missing,
        postgrestError: body?.postgrestError,
        duplicateProfileInfo: body?.duplicateProfileInfo,
        formatDuplicateLine: (d) =>
          `Duplicate profile rows: auth_user_id=${d.authUserId} rowCount≥${d.rowCountSeen}`,
      })
    );
  }
  if (!data) {
    return actionFail(["The Edge Function returned no response."]);
  }
  const mapped: TestAccountsResponse = {
    ...data,
    errors: (data.errors ?? []).map((e) => redact(mapFnError(e))),
    warnings: (data.warnings ?? []).map((w) => redact(w)),
  };
  if (mapped.ok !== true && mapped.errors.length === 0) {
    mapped.errors.push("Unknown error from Edge Function.");
  }
  return actionOk(mapped);
}

export async function testAccountsStatus(): Promise<
  ActionResult<TestAccountsResponse>
> {
  return callEdgeFn("status");
}

export async function testAccountsEnable(): Promise<
  ActionResult<TestAccountsResponse>
> {
  const result = await callEdgeFn("enable");
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}

export async function testAccountsDisable(): Promise<
  ActionResult<TestAccountsResponse>
> {
  const result = await callEdgeFn("disable");
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}

export async function testAccountsDiagnose(): Promise<
  ActionResult<TestAccountsResponse>
> {
  return callEdgeFn("diagnose");
}
