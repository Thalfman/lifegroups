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
import { validateInviteUserPayload } from "@/lib/admin/validation";
import type { InviteUserSuccess } from "@/lib/admin/invite-workflow-view";
import {
  buildErrorLines,
  extractErrorBody,
  makeMapFnError,
  makeTokenForStatus,
  redact,
} from "@/lib/admin/edge-fn-error";
import { readFormPayloadStringified } from "@/lib/shared/form-data";

const REVALIDATE_PATHS = ["/admin/super-admin", "/admin/people"] as const;

// Declared in the view model (lib never imports app; ADR 0039); re-exported
// here so this action module's public contract is unchanged.
export type { InviteUserSuccess } from "@/lib/admin/invite-workflow-view";

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
    "Supabase Auth rejected the invite. The auth user was not created. Retry is safe.",
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
    "The atomic write failed. The invite email may have been sent. See warnings below.",
  function_not_deployed_or_wrong_name:
    "The Edge Function isn't deployed or the name is wrong. Run: supabase functions deploy invite-user.",
  invalid_json_body: "Internal error: the request body wasn't valid JSON.",
  method_not_allowed: "Internal error: wrong HTTP method.",
};

const mapFnError = makeMapFnError(FN_ERROR_MESSAGES);

const tokenForStatus = makeTokenForStatus({
  unauthorized: "invalid_or_expired_session",
  forbidden: "super_admin_required",
  notFound: "function_not_deployed_or_wrong_name",
  serverError: "db_error",
  fallback: "db_error",
});

// Map an Edge Function failure response to display lines. Both failure paths —
// the thrown-Response body and the `ok: false` data payload — carry the same
// shape, so they share one mapping. `tokenForStatus(200)` resolves to the same
// "db_error" default the data path used inline, so the two paths stay identical.
function errorLinesFrom(
  source: Partial<EdgeFnResponse>,
  status: number | null
): string[] {
  const code = source.code ?? source.errors?.[0] ?? tokenForStatus(status);
  return buildErrorLines({
    status,
    code,
    mapFnError,
    messages: FN_ERROR_MESSAGES,
    missing: source.missing,
    postgrestError: source.postgrestError,
    duplicateProfileInfo: source.duplicateProfileInfo,
    formatDuplicateLine: (d) =>
      `Duplicate profile rows seen: ${d.rowCountSeen}`,
    extras: source.errors,
    warnings: source.warnings,
  });
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

  const raw = readFormPayloadStringified(input);
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
    const { status, body } = await extractErrorBody<EdgeFnResponse>(error);
    return actionFail(errorLinesFrom(body ?? {}, status));
  }

  if (!data) {
    return actionFail(["The Edge Function returned no response."]);
  }

  if (!data.ok) {
    return actionFail(errorLinesFrom(data, 200));
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
