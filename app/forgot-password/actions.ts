"use server";

import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { log } from "@/lib/observability/logger";
import { hashEmail, newCorrelationId } from "@/lib/observability/identifiers";
import { checkForgotPasswordLimit } from "@/lib/security/rate-limit";

export type ForgotPasswordState = {
  submitted?: boolean;
  error?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROUTE = "forgot-password";

function getSiteUrl(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

// Returns a client IP only when the source header is one the platform sets
// itself (i.e. not attacker-spoofable). On Vercel that's `x-vercel-forwarded-for`;
// on Cloudflare that's `cf-connecting-ip`. `x-forwarded-for`/`x-real-ip` are
// trusted only when the deployment opts in via TRUST_FORWARDED_FOR=true,
// since they are easy to forge on direct-to-app setups. Returns `null` when
// no trusted IP is available — the rate limiter then skips its per-IP bucket
// for that request to avoid all "unknown" callers sharing a single window.
async function extractClientIp(): Promise<string | null> {
  const h = await headers();
  const vercel = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;
  const cf = h.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  if (process.env.TRUST_FORWARDED_FOR === "true") {
    const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
    const real = h.get("x-real-ip")?.trim();
    if (real) return real;
  }
  return null;
}

// Always returns the same generic success state so the form cannot be
// used to discover which emails are registered. Real failures (invalid
// site URL, Supabase unreachable, rate limit exceeded) are logged
// server-side but never surfaced to the user.
export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const requestId = newCorrelationId();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const emailHashPromise = hashEmail(email);
  const ipPromise = extractClientIp();
  const [emailHash, ip] = await Promise.all([emailHashPromise, ipPromise]);

  const limit = await checkForgotPasswordLimit({
    ip,
    emailHash,
    requestId,
  });
  if (limit.configured && !limit.allowed) {
    log.warn({
      event: "forgot_password_throttled",
      outcome: "throttled",
      route_or_action: ROUTE,
      request_id: requestId,
      email_hash: emailHash,
      ip_present: ip !== null,
      which: limit.which,
    });
    return { submitted: true };
  }

  const siteUrl = getSiteUrl();
  if (!siteUrl) {
    log.warn({
      event: "site_url_not_configured",
      route_or_action: ROUTE,
      request_id: requestId,
    });
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    log.warn({
      event: "supabase_not_configured",
      route_or_action: ROUTE,
      request_id: requestId,
    });
    return { submitted: true };
  }

  const redirectTo = siteUrl ? `${siteUrl}/reset-password` : undefined;
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) {
    log.error({
      event: "reset_password_send_failed",
      outcome: "fail",
      route_or_action: ROUTE,
      request_id: requestId,
      email_hash: emailHash,
      error_code: error.code ?? "unknown",
      error_message: error.message,
    });
  } else {
    log.info({
      event: "reset_password_sent",
      outcome: "ok",
      route_or_action: ROUTE,
      request_id: requestId,
      email_hash: emailHash,
    });
  }

  return { submitted: true };
}
