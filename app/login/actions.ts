"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultLandingPathForRole, type UserRole } from "@/lib/auth/roles";
import { log } from "@/lib/observability/logger";
import { hashEmail, newCorrelationId } from "@/lib/observability/identifiers";
import {
  PW_SETUP_COOKIE,
  passwordSetupCookieClearOptions,
} from "@/lib/auth/password-setup";
import { isSafeNextPath } from "./next-path";
import type { ProfileStatus } from "@/types/enums";

export type LoginFormState = { error?: string };

const ROUTE = "login";

export async function loginAction(
  _prev: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const requestId = newCorrelationId();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nextRaw = formData.get("next");
  const next =
    typeof nextRaw === "string" && isSafeNextPath(nextRaw) ? nextRaw : null;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const emailHash = await hashEmail(email);
  log.info({
    event: "login_attempt",
    route_or_action: ROUTE,
    request_id: requestId,
    email_hash: emailHash,
  });

  const client = await createSupabaseServerClient();
  if (!client) {
    log.warn({
      event: "supabase_not_configured",
      outcome: "fail",
      route_or_action: ROUTE,
      request_id: requestId,
    });
    return { error: "Authentication is not configured on this deployment." };
  }

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    log.warn({
      event: "login_failed_credentials",
      outcome: "fail",
      route_or_action: ROUTE,
      request_id: requestId,
      email_hash: emailHash,
      // Record the real GoTrue code/status server-side (e.g. invalid_credentials
      // vs email_not_confirmed vs over_request_rate_limit) so failures are
      // triageable from logs. The user-facing message below stays deliberately
      // generic so it never leaks whether the email is registered.
      error_code: error.code ?? "invalid_credentials",
      auth_status: error.status,
    });
    return { error: "Invalid email or password." };
  }

  // A successful password sign-in means this session is not (or no longer)
  // password-setup-pending, so release any set-password gate marker. Without
  // this, signing into a *different* account while a stale marker is present
  // would bounce the new session to /reset-password and let the form retarget
  // the wrong account.
  const cookieStore = await cookies();
  cookieStore.set(PW_SETUP_COOKIE, "", passwordSetupCookieClearOptions());

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    log.error({
      event: "login_no_session_after_signin",
      outcome: "fail",
      route_or_action: ROUTE,
      request_id: requestId,
      email_hash: emailHash,
    });
    return { error: "Sign-in succeeded but no session was created." };
  }

  const profileQuery = await client
    .from("profiles")
    .select("role, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileQuery.error) {
    log.error({
      event: "login_profile_lookup_failed",
      outcome: "fail",
      route_or_action: ROUTE,
      request_id: requestId,
      email_hash: emailHash,
      error_code: profileQuery.error.code ?? "unknown",
      error_message: profileQuery.error.message,
    });
    // Sign the user back out so the browser doesn't end up with an active
    // session while the form is telling them the login failed. Without this
    // they could refresh into protected routes despite the error message.
    // Scope `local` so we only revoke the session we just created, not every
    // session the user has across other devices.
    await client.auth.signOut({ scope: "local" });
    return {
      error:
        "Sign-in succeeded but we couldn't load your profile. Please try again.",
    };
  }

  const profile = profileQuery.data as {
    role: UserRole;
    status: ProfileStatus;
  } | null;

  if (!profile) {
    log.warn({
      event: "login_profile_missing",
      outcome: "denied",
      route_or_action: ROUTE,
      request_id: requestId,
      email_hash: emailHash,
    });
    redirect("/unauthorized");
  }
  if (profile.status !== "active") {
    log.warn({
      event: "login_profile_inactive",
      outcome: "denied",
      route_or_action: ROUTE,
      request_id: requestId,
      email_hash: emailHash,
      actor_role: profile.role,
    });
    redirect("/unauthorized");
  }

  log.info({
    event: "login_success",
    outcome: "ok",
    route_or_action: ROUTE,
    request_id: requestId,
    email_hash: emailHash,
    actor_role: profile.role,
  });

  redirect(next ?? defaultLandingPathForRole(profile.role));
}
