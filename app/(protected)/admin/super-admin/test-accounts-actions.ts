"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import { type ActionResult, actionFail, actionOk } from "@/lib/admin/action-result";

const REVALIDATE_PATH = "/admin/super-admin";

export type TestAccountUserRow = {
  key: "admin" | "leader1" | "leader2" | "coleader";
  email: string;
  role: string;
  authUser: "exists" | "missing" | "created" | "updated" | "deleted" | "skipped";
  profile: "active" | "inactive" | "missing" | "created" | "updated" | "skipped";
  groupAssignment: "active" | "inactive" | "none" | "added" | "deactivated";
  groupName: string | null;
  skipReason: string | null;
};

export type TestAccountsResponse = {
  ok: boolean;
  action: "status" | "enable" | "disable" | "unknown";
  enabledOverall?: boolean;
  isRemoteSupabase?: boolean;
  code?: string;
  message?: string;
  missing?: string[];
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
  unauthorized:
    "Your session is no longer valid. Sign out and back in, then retry.",
  // Role-gate problems (HTTP 403).
  forbidden: "Only the super admin can manage test accounts.",
  super_admin_required: "Only the super admin can manage test accounts.",
  authorization_check_failed:
    "The Edge Function couldn't verify your role. Try again in a moment.",
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

function mapFnError(raw: string): string {
  if (FN_ERROR_MESSAGES[raw]) return FN_ERROR_MESSAGES[raw];
  return raw;
}

function redact(message: string): string {
  return message.replace(
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    "[REDACTED_JWT]",
  );
}

// supabase-js v2.45 returns `FunctionsHttpError` (and friends) on non-2xx
// responses. The original Response is on `.context`. The Edge Function's
// JSON body is the only way to surface its structured `code` / `missing`
// fields to the panel, since `error.message` is just the generic
// "Edge Function returned a non-2xx status code".
async function extractErrorBody(
  err: unknown,
): Promise<{ status: number | null; body: Partial<TestAccountsResponse> | null }> {
  if (!err || typeof err !== "object") return { status: null, body: null };
  const ctx = (err as { context?: unknown }).context;
  if (!(ctx instanceof Response)) return { status: null, body: null };
  const status = ctx.status;
  try {
    const text = await ctx.clone().text();
    if (!text) return { status, body: null };
    return { status, body: JSON.parse(text) as Partial<TestAccountsResponse> };
  } catch {
    return { status, body: null };
  }
}

// Synthesize a token from HTTP status when no structured body is
// available (e.g. infra-level 404 from the gateway, or unparseable body).
function tokenForStatus(status: number | null): string {
  if (status === 401) return "missing_or_invalid_session";
  if (status === 403) return "super_admin_required";
  if (status === 404) return "function_not_deployed_or_wrong_name";
  if (status && status >= 500) return "test_account_seed_failed";
  return "unknown_error";
}

function buildErrorLines(args: {
  status: number | null;
  code: string;
  missing: string[] | undefined;
}): string[] {
  const lines: string[] = [];
  const statusLabel = args.status ?? "?";
  lines.push(`HTTP ${statusLabel} ${args.code}`);
  lines.push(mapFnError(args.code));
  if (args.missing && args.missing.length > 0) {
    lines.push(`Missing Edge Function secrets: ${args.missing.join(", ")}`);
  }
  return lines.map(redact);
}

async function callEdgeFn(
  action: "status" | "enable" | "disable",
): Promise<ActionResult<TestAccountsResponse>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["The database is not configured on this deployment."]);

  const { data, error } = await client.functions.invoke<TestAccountsResponse>(
    "manage-test-auth-users",
    { body: { action } },
  );

  if (error) {
    const { status, body } = await extractErrorBody(error);
    const code =
      body?.code ??
      body?.errors?.[0] ??
      tokenForStatus(status);
    return actionFail(
      buildErrorLines({ status, code, missing: body?.missing }),
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

export async function testAccountsStatus(): Promise<ActionResult<TestAccountsResponse>> {
  return callEdgeFn("status");
}

export async function testAccountsEnable(): Promise<ActionResult<TestAccountsResponse>> {
  const result = await callEdgeFn("enable");
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}

export async function testAccountsDisable(): Promise<ActionResult<TestAccountsResponse>> {
  const result = await callEdgeFn("disable");
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}
