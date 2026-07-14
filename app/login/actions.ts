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
import {
  LANDING_HINT_COOKIE,
  landingHintCookieClearOptions,
  landingHintCookieSetOptions,
  landingHintForRole,
} from "@/lib/auth/landing-hint";
import { IDLE_COOKIE, idleCookieSetOptions } from "@/lib/auth/idle-timeout";
import { rpcLogUsageEvent } from "@/lib/usage/rpc";
import { extractClientIp } from "@/lib/security/client-ip";
import { checkLoginLimit } from "@/lib/security/rate-limit";
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

  const [emailHash, ip] = await Promise.all([
    hashEmail(email),
    extractClientIp(),
  ]);
  log.info({
    event: "login_attempt",
    route_or_action: ROUTE,
    request_id: requestId,
    email_hash: emailHash,
  });

  // App-level throttle (S-1): slow repeated attempts before they reach
  // GoTrue. The throttled copy is identical to a failed login so the form
  // never reveals whether a throttle or bad credentials fired.
  const limit = await checkLoginLimit({ ip, emailHash, requestId });
  if (limit.configured && !limit.allowed) {
    log.warn({
      event: "login_throttled",
      outcome: "throttled",
      route_or_action: ROUTE,
      request_id: requestId,
      email_hash: emailHash,
      ip_present: ip !== null,
      which: limit.which,
    });
    return { error: "Invalid email or password." };
  }

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
    cookieStore.set(LANDING_HINT_COOKIE, "", landingHintCookieClearOptions());
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

  // Best-effort usage telemetry. The RPC self-gates on the usage_tracking flag
  // and no-ops when it's off, so this records a sign-in only while the Super
  // Admin has tracking on — and never blocks or fails the sign-in.
  try {
    await rpcLogUsageEvent(client, { p_event_type: "login", p_area: null });
  } catch {
    // Telemetry must not affect auth.
  }

  // Record the role's landing path so a later bare-domain (`/`) launch can be
  // redirected straight to this surface by middleware, skipping the dynamic `/`
  // server render. Non-authoritative UX hint only (see lib/auth/landing-hint).
  const hint = landingHintForRole(profile.role);
  if (hint) {
    cookieStore.set(LANDING_HINT_COOKIE, hint, landingHintCookieSetOptions());
  }

  // Seed a fresh idle-timeout window for the new session. The marker is
  // long-lived (idle-timeout.ts), so any marker left over from a PRIOR session
  // on this browser would be stale and make the first post-login request look
  // idle — instantly signing the fresh session back out. Overwriting it here
  // (and clearing it on logout) binds the window to this sign-in.
  cookieStore.set(IDLE_COOKIE, String(Date.now()), idleCookieSetOptions());

  redirect(next ?? defaultLandingPathForRole(profile.role));
}
