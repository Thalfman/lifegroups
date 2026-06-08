"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import { resolveSiteOrigin } from "@/lib/shared/site-origin";
import {
  type ActionResult,
  actionFail,
  actionOk,
} from "@/lib/admin/action-result";
import {
  type InviteUserPayload,
  validateInviteUserPayload,
} from "@/lib/admin/validation";

const REVALIDATE_PATHS = ["/admin/super-admin", "/admin/people"] as const;

export type InviteUserSuccess = {
  profileId: string;
  email: string;
  role: InviteUserPayload["role"];
  authUserState: "invited" | "existing_reused";
  groupAssignmentState: "none" | "created" | "reactivated" | "already_active";
  // A copyable setup link surfaced on every delivery path when one could be
  // minted: the invite action_link for a newly-invited user, or a best-effort
  // password-recovery link for an existing login. Absent only if minting failed.
  inviteLink?: string;
  warnings: string[];
};

type EdgeFnResponse = {
  ok: boolean;
  code?: string;
  message?: string;
  profileId?: string;
  email?: string;
  role?: InviteUserSuccess["role"];
  authUserState?: InviteUserSuccess["authUserState"];
  groupAssignmentState?: InviteUserSuccess["groupAssignmentState"];
  inviteLink?: string;
  warnings?: string[];
  errors?: string[];
  missing?: string[];
  postgrestError?: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  duplicateProfileInfo?: { authUserId?: string; rowCountSeen: number };
};

const FN_ERROR_MESSAGES: Record<string, string> = {
  missing_authorization_header:
    "Your session token didn't reach the Edge Function. Sign out, sign back in, and retry.",
  invalid_or_expired_session:
    "Your Supabase session is invalid or expired. Sign out and back in, then retry.",
  profile_not_found:
    "Your auth user has no linked app profile. Ask an existing super admin to relink it.",
  profile_not_active:
    "Your app profile is not active. Ask an existing super admin to reactivate it.",
  super_admin_required: "Only the super admin can invite users.",
  duplicate_profiles_for_auth_user:
    "Multiple app profiles are linked to your auth user. Resolve the duplicate before retrying.",
  missing_edge_function_env:
    "Edge Function secrets are missing. Add them in Supabase Dashboard → Edge Functions → invite-user → Secrets, then redeploy.",
  invalid_payload:
    "The form has invalid values. Check the fields and try again.",
  invite_failed:
    "Supabase Auth rejected the invite. The auth user was not created — retry is safe.",
  cannot_modify_super_admin_profile:
    "A super_admin profile already uses that email and can't be modified from this form.",
  missing_group:
    "The selected group no longer exists. Refresh the page and try again.",
  profile_write_conflict:
    "Another writer modified the profile during the request. Retry in a moment.",
  edge_function_only:
    "The Edge Function called the database without the expected internal JWT. Check function deployment.",
  invalid_actor:
    "The signed-in actor failed the database-side super admin recheck. Sign in again and retry.",
  profile_lookup_query_failed:
    "The Edge Function could not query profiles with the configured elevated key. See PostgREST diagnostics in the function logs.",
  db_error:
    "The atomic write failed. The invite email may have been sent — see warnings below.",
  function_not_deployed_or_wrong_name:
    "The Edge Function isn't deployed or the name is wrong. Run: supabase functions deploy invite-user.",
  invalid_json_body: "Internal error: the request body wasn't valid JSON.",
  method_not_allowed: "Internal error: wrong HTTP method.",
};

function mapFnError(raw: string): string {
  if (FN_ERROR_MESSAGES[raw]) return FN_ERROR_MESSAGES[raw];
  return raw;
}

function redact(message: string): string {
  return message.replace(
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    "[REDACTED_JWT]"
  );
}

async function extractErrorBody(
  err: unknown
): Promise<{ status: number | null; body: Partial<EdgeFnResponse> | null }> {
  if (!err || typeof err !== "object") return { status: null, body: null };
  const ctx = (err as { context?: unknown }).context;
  if (!(ctx instanceof Response)) return { status: null, body: null };
  const status = ctx.status;
  try {
    const text = await ctx.clone().text();
    if (!text) return { status, body: null };
    return { status, body: JSON.parse(text) as Partial<EdgeFnResponse> };
  } catch {
    return { status, body: null };
  }
}

function tokenForStatus(status: number | null): string {
  if (status === 401) return "invalid_or_expired_session";
  if (status === 403) return "super_admin_required";
  if (status === 404) return "function_not_deployed_or_wrong_name";
  if (status && status >= 500) return "db_error";
  return "db_error";
}

function buildErrorLines(args: {
  status: number | null;
  code: string;
  missing?: string[];
  postgrestError?: EdgeFnResponse["postgrestError"];
  duplicateProfileInfo?: EdgeFnResponse["duplicateProfileInfo"];
  extras?: string[];
  warnings?: string[];
}): string[] {
  const lines: string[] = [];
  const statusLabel = args.status ?? "?";
  lines.push(`HTTP ${statusLabel} ${args.code}`);
  lines.push(mapFnError(args.code));
  if (args.missing && args.missing.length > 0) {
    lines.push(`Missing Edge Function secrets: ${args.missing.join(", ")}`);
  }
  if (args.postgrestError) {
    const pg = args.postgrestError;
    if (pg.code) lines.push(`PostgREST code: ${pg.code}`);
    if (pg.message) lines.push(`PostgREST message: ${pg.message}`);
    if (pg.details) lines.push(`PostgREST details: ${pg.details}`);
    if (pg.hint) lines.push(`PostgREST hint: ${pg.hint}`);
  }
  if (args.duplicateProfileInfo) {
    const d = args.duplicateProfileInfo;
    lines.push(`Duplicate profile rows seen: ${d.rowCountSeen}`);
  }
  if (args.warnings && args.warnings.length > 0) {
    for (const w of args.warnings) lines.push(`Warning: ${w}`);
  }
  if (args.extras && args.extras.length > 0) {
    for (const e of args.extras) {
      // Skip the bare repeat of the code token; we've already mapped it.
      if (e === args.code) continue;
      // Skip known token-only errors mapped above.
      if (FN_ERROR_MESSAGES[e]) continue;
      lines.push(e);
    }
  }
  return lines.map(redact);
}

function readFromForm(input: unknown): Record<string, unknown> {
  if (input instanceof FormData) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of input.entries()) {
      out[key] = value === null ? undefined : String(value);
    }
    return out;
  }
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

// Shared invite workflow. `delivery` selects how the credential reaches the
// invitee: "email" sends the Supabase invite email (historical default);
// "link" returns a copyable action_link in the success value. Both run the
// same audited profile/group/audit write in the Edge Function.
async function runInvite(
  input: FormData | Record<string, unknown>,
  delivery: "email" | "link"
): Promise<ActionResult<InviteUserSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFromForm(input);
  const v = validateInviteUserPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client)
    return actionFail(["The database is not configured on this deployment."]);

  // Resolve the redirect target here, in the Next.js runtime where the site
  // URL is configured, and pass it to the Edge Function. The function runs in
  // Supabase's separate secret store, so relying on its own SITE_URL env left
  // `redirectTo` undefined — which bounced invitees to the Site URL root and,
  // for anonymous visitors, on to /login (the sign-in page) instead of the
  // password-setup page. Omit when the origin can't be resolved so the
  // function falls back to its env-derived value (prior behavior).
  const origin = await resolveSiteOrigin();
  const redirectTo = origin ? `${origin}/reset-password` : undefined;

  const { data, error } = await client.functions.invoke<EdgeFnResponse>(
    "invite-user",
    {
      body: {
        ...v.value,
        delivery,
        ...(redirectTo ? { redirect_to: redirectTo } : {}),
      },
    }
  );

  if (error) {
    const { status, body } = await extractErrorBody(error);
    const code = body?.code ?? body?.errors?.[0] ?? tokenForStatus(status);
    return actionFail(
      buildErrorLines({
        status,
        code,
        missing: body?.missing,
        postgrestError: body?.postgrestError,
        duplicateProfileInfo: body?.duplicateProfileInfo,
        extras: body?.errors,
        warnings: body?.warnings,
      })
    );
  }

  if (!data) {
    return actionFail(["The Edge Function returned no response."]);
  }

  if (!data.ok) {
    const code = data.code ?? data.errors?.[0] ?? "db_error";
    return actionFail(
      buildErrorLines({
        status: 200,
        code,
        missing: data.missing,
        postgrestError: data.postgrestError,
        duplicateProfileInfo: data.duplicateProfileInfo,
        extras: data.errors,
        warnings: data.warnings,
      })
    );
  }

  if (
    !data.profileId ||
    !data.email ||
    !data.role ||
    !data.authUserState ||
    !data.groupAssignmentState
  ) {
    return actionFail([
      "Edge Function reported success but returned incomplete data. Try again.",
    ]);
  }

  for (const path of REVALIDATE_PATHS) revalidatePath(path);

  return actionOk({
    profileId: data.profileId,
    email: data.email,
    role: data.role,
    authUserState: data.authUserState,
    groupAssignmentState: data.groupAssignmentState,
    inviteLink: data.inviteLink,
    warnings: (data.warnings ?? []).map(redact),
  });
}

// Form action bound to the "Send invite" button via useActionState. Sends the
// Supabase invite email.
export async function superAdminInviteUser(
  _prev: ActionResult<InviteUserSuccess> | undefined,
  input: FormData | Record<string, unknown>
): Promise<ActionResult<InviteUserSuccess>> {
  return runInvite(input, "email");
}

// Invoked directly from the client by the "Copy invite link" button. Provisions
// the same profile/group/audit write but returns a copyable invite link for a
// newly-invited user instead of sending the email.
export async function superAdminGenerateInviteLink(
  input: FormData | Record<string, unknown>
): Promise<ActionResult<InviteUserSuccess>> {
  return runInvite(input, "link");
}
