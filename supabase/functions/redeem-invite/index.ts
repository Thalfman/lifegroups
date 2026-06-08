// Supabase Edge Function: redeem-invite
//
// Public counterpart to `invite-user` (Phase IL.1). Backs the self-signup
// landing page at /invite/<token>. Runs in Deno on Supabase's edge runtime and
// holds the service-role key. Unlike invite-user it takes NO caller JWT — the
// bearer credential is the invite token itself (a 256-bit secret), so the
// function must be deployed with `verify_jwt = false`.
//
// Flow:
//   1. Validate the body (token, full_name, email, password).
//   2. Look up the invitation by sha256(token); reject if expired/revoked/spent.
//   3. Reject if the email already has a Supabase Auth user (email_in_use).
//   4. `auth.admin.createUser` with the supplied password (email_confirm=true).
//   5. Call the SECURITY DEFINER RPC `redeem_invitation` to atomically consume
//      the link and create/relink the profile (+ optional group) and audit row.
//   6. If the RPC fails, best-effort delete the just-created auth user so the
//      email can be retried, then surface a stable error code.
//
// This function never returns passwords, tokens, the service-role key, or env
// dumps. Errors are reduced to fixed codes; raw auth/db text is not echoed.

// deno-lint-ignore-file no-explicit-any
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.0";

type ResponseBody = {
  ok: boolean;
  code?: string;
  errors: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// Role privilege rank (lower = more privileged). A shareable link is a
// low-trust, unverified credential, so it must not be usable to claim a roster
// profile MORE privileged than the invitation itself grants. The RPC enforces
// the same ceiling; this mirror just avoids creating an auth user we'd delete.
const ROLE_RANK: Record<string, number> = {
  super_admin: 0,
  ministry_admin: 1,
  over_shepherd: 2,
  leader: 3,
  co_leader: 4,
};

function jsonResponse(body: ResponseBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function fail(code: string, status: number): Response {
  return jsonResponse({ ok: false, code, errors: [code] }, status);
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

// Paginated case-insensitive lookup; supabase-js v2.45 exposes no direct
// getUserByEmail. Mirrors findAuthUserByEmail in functions/invite-user.
async function emailHasAuthUser(
  client: SupabaseClient,
  email: string
): Promise<boolean> {
  const target = email.toLowerCase();
  const perPage = 200;
  const maxPages = 500;
  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error)
      throw new Error(`listUsers failed on page ${page}: ${error.message}`);
    const users = data?.users ?? [];
    if (users.some((u) => (u.email ?? "").toLowerCase() === target))
      return true;
    if (users.length < perPage) return false;
  }
  throw new Error("listUsers exceeded page cap; could not confirm email");
}

type Invitation = {
  id: string;
  role: string;
  group_id: string | null;
  single_use: boolean;
  max_uses: number | null;
  used_count: number;
  expires_at: string;
  revoked_at: string | null;
};

// Map an exception raised by redeem_invitation to a stable response code.
// "email already known" cases collapse to the generic `email_unavailable`
// (see the email-enumeration note at the call site) rather than confirming the
// address exists.
function mapRpcToken(message: string): { code: string; status: number } {
  if (message.includes("invitation_not_found"))
    return { code: "invitation_not_found", status: 404 };
  if (message.includes("invitation_expired"))
    return { code: "invitation_expired", status: 410 };
  if (message.includes("invitation_revoked"))
    return { code: "invitation_revoked", status: 410 };
  if (message.includes("invitation_used"))
    return { code: "invitation_used", status: 409 };
  if (message.includes("rate_limited"))
    return { code: "rate_limited", status: 429 };
  if (message.includes("email_taken"))
    return { code: "email_unavailable", status: 409 };
  if (message.includes("forbidden_target"))
    return { code: "email_unavailable", status: 409 };
  if (message.includes("profile_write_conflict"))
    return { code: "email_unavailable", status: 409 };
  if (message.includes("invalid_input"))
    return { code: "invalid_input", status: 400 };
  return { code: "db_error", status: 500 };
}

declare const Deno: {
  env: { get: (k: string) => string | undefined };
  serve: (handler: (req: Request) => Promise<Response> | Response) => any;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return fail("method_not_allowed", 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return fail("missing_edge_function_env", 500);
  }

  let parsed: any;
  try {
    parsed = await req.json();
  } catch {
    return fail("invalid_json_body", 400);
  }

  const token = typeof parsed?.token === "string" ? parsed.token.trim() : "";
  const fullName =
    typeof parsed?.full_name === "string" ? parsed.full_name.trim() : "";
  const email =
    typeof parsed?.email === "string" ? parsed.email.trim().toLowerCase() : "";
  const password = typeof parsed?.password === "string" ? parsed.password : "";

  if (!token || !fullName) return fail("invalid_input", 400);
  if (!EMAIL_RE.test(email)) return fail("invalid_email", 400);
  if (password.length < MIN_PASSWORD_LENGTH) return fail("weak_password", 400);

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Always-on, DB-backed per-IP throttle. This function is public, so the only
  // way to bound a direct POST (which skips the Next action's rate limit) is to
  // throttle here. Supabase's edge gateway (Envoy, use_remote_address=true)
  // APPENDS the real connection IP to x-forwarded-for, so the trusted client IP
  // is the LAST hop — not the first, which a caller can spoof by prepending
  // entries. We therefore key on the last hop: for a direct attacker that's
  // their real connection IP (not forgeable here); for the normal browser flow
  // it's the Vercel egress IP (the fine-grained per-invitee limit already runs
  // in the action). A generous ceiling avoids nuisance-throttling legitimate
  // shared-egress traffic while still capping a single abusive IP. Fail open on
  // a throttle backend error so a transient DB hiccup can't take signup down.
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const hops = xff
    .split(",")
    .map((h) => h.trim())
    .filter((h) => h.length > 0);
  const peerIp =
    hops.length > 0
      ? hops[hops.length - 1]
      : req.headers.get("x-real-ip")?.trim() || "";
  if (peerIp) {
    const { data: allowed, error: rateErr } = await service.rpc(
      "check_invite_redeem_rate",
      { p_key: peerIp, p_limit: 100, p_window_seconds: 900 }
    );
    if (!rateErr && allowed === false) {
      return fail("rate_limited", 429);
    }
  }

  const tokenHash = await sha256Hex(token);

  // 1. Pre-check the invitation so we don't create an auth user for a dead link.
  const { data: invRow, error: invErr } = await service
    .from("invitations")
    .select(
      "id, role, group_id, single_use, max_uses, used_count, expires_at, revoked_at"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (invErr) return fail("db_error", 500);
  const inv = invRow as Invitation | null;
  if (!inv) return fail("invitation_not_found", 404);
  if (inv.revoked_at) return fail("invitation_revoked", 410);
  if (new Date(inv.expires_at).getTime() <= Date.now())
    return fail("invitation_expired", 410);
  if (inv.max_uses !== null && inv.used_count >= inv.max_uses)
    return fail("invitation_used", 409);

  // 2. Don't let self-signup hijack a real login, but DO let a person already
  //    on the roster (a profiles row with no linked auth user yet) CLAIM their
  //    account. `redeem_invitation` is the authority and relinks such a row;
  //    this pre-check only avoids creating an auth user for a case the RPC will
  //    refuse. Cases:
  //      * profile with a linked auth user, or a super_admin roster row ->
  //        reject. Kept generic (`email_unavailable`) so a link holder can't
  //        tell a claimable roster row from a real account.
  //      * profile with auth_user_id IS NULL (non-super_admin) -> fall through
  //        to createUser + RPC, which relinks it (the claim path).
  //      * no profile at all -> brand-new path; additionally reject if an Auth
  //        user already owns the email (a login with no profile) so it can't be
  //        hijacked. The listUsers scan runs ONLY here -- on the claim branch
  //        there is by definition no linked auth user for the profile, and a
  //        stray same-email auth user is caught by createUser below.
  const { data: existingProfile, error: profileErr } = await service
    .from("profiles")
    .select("auth_user_id, role, status")
    .eq("email", email)
    .maybeSingle();
  if (profileErr) return fail("db_error", 500);
  if (existingProfile) {
    const existingRank = ROLE_RANK[existingProfile.role as string] ?? 0;
    const inviteRank = ROLE_RANK[inv.role] ?? 99;
    // Only a profile awaiting setup is claimable; a disabled ('inactive')
    // profile must not be reactivated via a shared link.
    const claimableStatus =
      existingProfile.status === "active" ||
      existingProfile.status === "invited";
    if (
      existingProfile.auth_user_id !== null ||
      existingProfile.role === "super_admin" ||
      // The link must not claim a profile more privileged than it grants.
      existingRank < inviteRank ||
      !claimableStatus
    ) {
      return fail("email_unavailable", 409);
    }
    // else: claimable roster profile at or below the link's level -> proceed
    // to createUser + RPC (which relinks it).
  } else {
    try {
      if (await emailHasAuthUser(service, email)) {
        return fail("email_unavailable", 409);
      }
    } catch {
      return fail("db_error", 500);
    }
  }

  // 3. Create the auth user with the chosen password (already email-confirmed
  //    since they proved control of the invite link).
  const { data: created, error: createErr } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
  if (createErr || !created?.user?.id) {
    // A duplicate here means a race with another signup of the same email;
    // keep the generic code so it can't be used to enumerate.
    return fail("email_unavailable", 409);
  }
  const authUserId = created.user.id;

  // 4. Atomically consume the link + write the profile/group/audit.
  const { data: rpcData, error: rpcErr } = await service.rpc(
    "redeem_invitation",
    {
      p_token_hash: tokenHash,
      p_auth_user_id: authUserId,
      p_full_name: fullName,
      p_email: email,
    }
  );

  if (rpcErr) {
    // Roll back the orphaned auth user so the email can be retried cleanly.
    try {
      await service.auth.admin.deleteUser(authUserId);
    } catch {
      // best-effort; surface the original error regardless.
    }
    const mapped = mapRpcToken(rpcErr.message ?? "");
    return fail(mapped.code, mapped.status);
  }

  const result = (rpcData ?? {}) as { profile_id?: string };
  if (!result.profile_id) {
    try {
      await service.auth.admin.deleteUser(authUserId);
    } catch {
      // best-effort.
    }
    return fail("db_error", 500);
  }

  return jsonResponse({ ok: true, errors: [] }, 200);
});
