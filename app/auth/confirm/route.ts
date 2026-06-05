import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startActionLog } from "@/lib/observability/instrument";
import { isValidOtpType, safeNext } from "./safe-next";

// Server-side verification endpoint for Supabase auth email links (password
// recovery / invite). The recovery email links the user to /reset-password (a
// page that consumes nothing on load); that page renders a form which POSTs
// here to verify the token via `verifyOtp`. The session is set into cookies by
// the server client, so the subsequent /reset-password render sees an
// authenticated recovery session.
//
// Verification is POST-only on purpose. The single-use token must only be spent
// on a deliberate user action — never on a GET. That closes two doors at once:
//   1. Email link-scanners (Outlook / Microsoft Defender Safe Links) that GET
//      links found in incoming mail.
//   2. Next.js <Link> prefetching, which would GET this route as soon as a link
//      to it scrolled into view and burn the token before the user clicked.
// A stray GET here (prefetch, scanner, stale bookmark) consumes nothing and is
// simply bounced back to /reset-password.

export const dynamic = "force-dynamic";

function seeOther(request: NextRequest, path: string): NextResponse {
  // 303 so the browser issues a GET to the destination after this POST.
  return NextResponse.redirect(new URL(path, request.url), 303);
}

function field(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.redirect(new URL("/reset-password", request.url));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = startActionLog("auth.confirm");
  const form = await request.formData();
  const next = safeNext(field(form, "next"));

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured" });
    return seeOther(request, "/reset-password?status=invalid");
  }

  const tokenHash = field(form, "token_hash");
  const type = field(form, "type");

  // Preferred path: token_hash flow (scanner- and cross-device-safe).
  if (tokenHash && isValidOtpType(type)) {
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) {
      ctx.finish("denied", { error_code: error.code ?? "verify_otp_failed" });
      return seeOther(request, "/reset-password?status=invalid");
    }
    ctx.finish("ok", { reason: "token_hash" });
    return seeOther(request, next);
  }

  // Backward-compat: links minted before the email template switch arrive with
  // a PKCE `?code=`. Keep exchanging it so in-flight reset emails still work
  // during rollout.
  const code = field(form, "code");
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      ctx.finish("denied", {
        error_code: error.code ?? "exchange_code_failed",
      });
      return seeOther(request, "/reset-password?status=invalid");
    }
    ctx.finish("ok", { reason: "code" });
    return seeOther(request, next);
  }

  ctx.finish("fail", { error_code: "missing_token" });
  return seeOther(request, "/reset-password?status=invalid");
}
