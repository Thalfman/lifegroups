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

// Returns a client IP only when the deployment has explicitly declared
// which proxy header to trust via TRUSTED_PROXY. Otherwise returns null
// and the per-IP bucket is skipped — preventing both header spoofing (on
// self-hosted/direct-to-origin deploys where platform headers are
// attacker-controlled) and the cross-user shared-bucket DoS that would
// happen if every IP-less request hashed to the same key.
//
// Accepted values:
//   - "vercel"     -> trust x-vercel-forwarded-for
//   - "cloudflare" -> trust cf-connecting-ip
//   - "generic"    -> trust x-forwarded-for (first) then x-real-ip; only set
//                     this when the deployment terminates at a proxy that
//                     overwrites these headers.
//   - unset/other  -> no per-IP throttle (per-email throttle still applies)
async function extractClientIp(): Promise<string | null> {
  const h = await headers();
  const trusted = process.env.TRUSTED_PROXY?.trim().toLowerCase();
  if (trusted === "vercel") {
    return h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || null;
  }
  if (trusted === "cloudflare") {
    return h.get("cf-connecting-ip")?.trim() || null;
  }
  if (trusted === "generic") {
    const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
    return h.get("x-real-ip")?.trim() || null;
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
