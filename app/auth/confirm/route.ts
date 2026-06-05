import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startActionLog } from "@/lib/observability/instrument";
import { isValidOtpType, safeNext } from "./safe-next";

// Server-side verification endpoint for Supabase auth email links (password
// recovery / invite). The recovery email template links the user here with a
// single-use `token_hash` + `type`. We verify it via `verifyOtp`, which makes a
// POST to Supabase Auth and returns the session in the response body — set into
// cookies by the server client — so the subsequent /reset-password render sees
// an authenticated recovery session.
//
// Why this exists (vs. exchanging on the /reset-password page load): the old
// flow consumed the link on a plain GET of the page, which (a) broke on a
// re-click / refresh / cross-device open and (b) was fragile against PKCE's
// browser-bound code_verifier. Routing through verifyOtp removes the
// code_verifier dependency (works cross-device) and centralises consumption in
// one place. The /reset-password page now gates the click behind a button so an
// email scanner's GET can't reach this route and burn the token.

export const dynamic = "force-dynamic";

function redirectTo(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ctx = startActionLog("auth.confirm");
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get("next"));

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured" });
    return redirectTo(request, "/reset-password?status=invalid");
  }

  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  // Preferred path: token_hash flow (scanner- and cross-device-safe).
  if (tokenHash && isValidOtpType(type)) {
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) {
      ctx.finish("denied", { error_code: error.code ?? "verify_otp_failed" });
      return redirectTo(request, "/reset-password?status=invalid");
    }
    ctx.finish("ok", { reason: "token_hash" });
    return redirectTo(request, next);
  }

  // Backward-compat: links minted before the email template switch arrive with
  // a PKCE `?code=`. Keep exchanging it so in-flight reset emails still work
  // during rollout.
  const code = params.get("code");
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      ctx.finish("denied", {
        error_code: error.code ?? "exchange_code_failed",
      });
      return redirectTo(request, "/reset-password?status=invalid");
    }
    ctx.finish("ok", { reason: "code" });
    return redirectTo(request, next);
  }

  ctx.finish("fail", { error_code: "missing_token" });
  return redirectTo(request, "/reset-password?status=invalid");
}
