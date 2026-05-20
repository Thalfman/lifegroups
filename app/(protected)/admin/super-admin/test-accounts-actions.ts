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
  summary: TestAccountUserRow[];
  groups: Record<"a" | "b", "exists" | "created" | "archived" | "missing">;
  warnings: string[];
  errors: string[];
};

const FN_ERROR_MESSAGES: Record<string, string> = {
  function_not_configured:
    "The test-accounts Edge Function is missing required environment variables. Set its secrets and redeploy.",
  missing_authorization_header:
    "Your session token didn't reach the Edge Function. Sign out, sign back in, and retry.",
  invalid_json_body: "Internal error: the request body wasn't valid JSON.",
  invalid_action: "Internal error: unrecognized action.",
  unauthorized: "Your session is no longer valid. Sign in again and retry.",
  forbidden: "Only the super admin can manage test accounts.",
  authorization_check_failed:
    "The Edge Function couldn't verify your role. Try again in a moment.",
  test_auth_users_disabled:
    "Test accounts are disabled on this deployment. Set ENABLE_TEST_AUTH_USERS=true on the Edge Function to allow enable/disable.",
  method_not_allowed: "Internal error: wrong HTTP method.",
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

async function callEdgeFn(
  action: "status" | "enable" | "disable",
): Promise<ActionResult<TestAccountsResponse>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Supabase is not configured on this deployment."]);

  const { data, error } = await client.functions.invoke<TestAccountsResponse>(
    "manage-test-auth-users",
    { body: { action } },
  );

  if (error) {
    return actionFail([redact(mapFnError(error.message ?? "unknown_error"))]);
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
