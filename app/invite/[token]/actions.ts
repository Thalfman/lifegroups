"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startActionLog } from "@/lib/observability/instrument";
import { checkInviteRedeemLimit } from "@/lib/security/rate-limit";

export type RedeemInviteState = { error?: string };

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EdgeResponse = {
  ok?: boolean;
  code?: string;
  errors?: string[];
};

// Friendly copy for the edge function's stable error codes. Anything else falls
// back to a generic message so raw auth/db text never reaches the browser.
const CODE_MESSAGES: Record<string, string> = {
  invitation_not_found:
    "This invite link is invalid. Ask whoever invited you for a fresh link.",
  invitation_expired:
    "This invite link has expired. Ask whoever invited you for a new one.",
  invitation_revoked:
    "This invite link has been turned off. Ask whoever invited you for a new one.",
  invitation_used:
    "This invite link has already been used. Ask whoever invited you for a new one.",
  // Generic on purpose: shown whether the email is already a login, already a
  // profile, or lost a race — never confirms which, to avoid an enumeration
  // oracle on a shared link.
  email_unavailable:
    "We couldn't sign you up with that email. If you already have an account, sign in or use Forgot password — otherwise try a different email.",
  invalid_email: "Enter a valid email address.",
  weak_password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  invalid_input: "Some required fields are missing. Check the form and retry.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
};

function mapCode(code: string | undefined): string {
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  return "We couldn't complete your signup. Please try again.";
}

// Mirrors forgot-password's trusted-proxy IP extraction: only trust a forwarded
// header the deployment has explicitly opted into via TRUSTED_PROXY.
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

export async function redeemInviteAction(
  _prev: RedeemInviteState,
  formData: FormData
): Promise<RedeemInviteState> {
  const ctx = startActionLog("self_signup.redeem_invite");

  const token = String(formData.get("token") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) {
    ctx.finish("fail", { error_code: "missing_token" });
    return { error: "This invite link is missing its token. Reopen the link." };
  }
  if (!fullName) {
    ctx.finish("fail", { error_code: "missing_name" });
    return { error: "Enter your full name." };
  }
  if (!email || !EMAIL_RE.test(email)) {
    ctx.finish("fail", { error_code: "invalid_email" });
    return { error: "Enter a valid email address." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    ctx.finish("fail", { error_code: "weak_password" });
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password !== confirm) {
    ctx.finish("fail", { error_code: "password_mismatch" });
    return { error: "Passwords don't match." };
  }

  const ip = await extractClientIp();
  const limit = await checkInviteRedeemLimit({ ip, requestId: ctx.requestId });
  if (limit.configured && !limit.allowed) {
    ctx.finish("denied", { error_code: "rate_limited" });
    return { error: CODE_MESSAGES.rate_limited };
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured" });
    return { error: "Signup is not configured on this deployment." };
  }

  // The per-IP limit above guards the browser flow; the Edge Function applies
  // its own always-on DB-backed per-IP throttle so a direct POST can't bypass
  // rate limiting (Phase IL.2).
  const { data, error } = await client.functions.invoke<EdgeResponse>(
    "redeem-invite",
    { body: { token, full_name: fullName, email, password } }
  );

  if (error) {
    // The edge function returns its stable code in the JSON body even on a
    // non-2xx; pull it out for friendly copy.
    let code: string | undefined;
    const respCtx = (error as { context?: unknown }).context;
    if (respCtx instanceof Response) {
      try {
        const body = (await respCtx.clone().json()) as EdgeResponse;
        code = body.code ?? body.errors?.[0];
      } catch {
        // ignore parse failures; fall through to generic copy.
      }
    }
    ctx.finish("fail", { error_code: code ?? "edge_error" });
    return { error: mapCode(code) };
  }

  if (!data?.ok) {
    const code = data?.code ?? data?.errors?.[0];
    ctx.finish("fail", { error_code: code ?? "edge_not_ok" });
    return { error: mapCode(code) };
  }

  ctx.finish("ok");
  redirect("/login?invited=1");
}
