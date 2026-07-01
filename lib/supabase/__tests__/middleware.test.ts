import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Control the Supabase client getClaims() returns and pretend env is configured.
const { mockCreateServerClient, mockGetClaims, mockSignOut } = vi.hoisted(
  () => ({
    mockCreateServerClient: vi.fn(),
    mockGetClaims: vi.fn(),
    mockSignOut: vi.fn(),
  })
);

vi.mock("@supabase/ssr", () => ({
  createServerClient: mockCreateServerClient,
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabaseEnvSafe: () => ({ url: "https://supabase.test", key: "anon-key" }),
}));

import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { LANDING_HINT_COOKIE } from "@/lib/auth/landing-hint";
import { IDLE_COOKIE, IDLE_LIMIT_MS } from "@/lib/auth/idle-timeout";
import {
  PW_SETUP_COOKIE,
  PW_SETUP_COOKIE_VALUE,
} from "@/lib/auth/password-setup";

const ORIGIN = "https://app.test";

// authed=true → getClaims resolves a claims object (a logged-in session);
// authed=false → no claims (anonymous).
function setSession(authed: boolean) {
  mockGetClaims.mockResolvedValue({
    data: authed ? { claims: { sub: "user-1" } } : null,
  });
  mockCreateServerClient.mockReturnValue({
    auth: { getClaims: mockGetClaims, signOut: mockSignOut },
  });
}

function request(
  path: string,
  opts: {
    cookies?: Record<string, string>;
    method?: string;
  } = {}
): NextRequest {
  const req = new NextRequest(new URL(path, ORIGIN), {
    method: opts.method ?? "GET",
  });
  for (const [name, value] of Object.entries(opts.cookies ?? {})) {
    req.cookies.set(name, value);
  }
  return req;
}

beforeEach(() => {
  mockCreateServerClient.mockReset();
  mockGetClaims.mockReset();
  mockSignOut.mockReset();
  mockSignOut.mockResolvedValue({ error: null });
});

// A last-active timestamp older than the idle window (definitely expired).
function expiredIdleValue(): string {
  return String(Date.now() - IDLE_LIMIT_MS - 1000);
}

describe("updateSupabaseSession idle timeout", () => {
  it("force-signs-out an idle authenticated GET and redirects (303) to /login?reason=timeout", async () => {
    setSession(true);
    const res = await updateSupabaseSession(
      request("/admin", { cookies: { [IDLE_COOKIE]: expiredIdleValue() } })
    );

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    // 303 See Other (not 307) so a timed-out POST doesn't re-POST to /login.
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?reason=timeout`);
    // The last-active marker is cleared so a fresh sign-in starts a new window.
    const cleared = res.cookies.get(IDLE_COOKIE);
    expect(cleared?.value).toBe("");
    expect(cleared?.maxAge).toBe(0);
  });

  it("uses a 303 (method-dropping) redirect for a timed-out POST", async () => {
    setSession(true);
    const res = await updateSupabaseSession(
      request("/admin", {
        method: "POST",
        cookies: { [IDLE_COOKIE]: expiredIdleValue() },
      })
    );

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?reason=timeout`);
  });

  it("still enforces the timeout when ?code= is on a non-callback route (/admin?code=x)", async () => {
    // The auth-callback waiver is scoped to callback landing paths, so a stale
    // session can't opt out by appending ?code= to an arbitrary protected route.
    setSession(true);
    const res = await updateSupabaseSession(
      request("/admin?code=x", {
        cookies: { [IDLE_COOKIE]: expiredIdleValue() },
      })
    );

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?reason=timeout`);
  });

  it("does not sign out a password-setup-pending session (would strand the account)", async () => {
    setSession(true);
    const res = await updateSupabaseSession(
      request("/reset-password", {
        cookies: {
          [IDLE_COOKIE]: expiredIdleValue(),
          [PW_SETUP_COOKIE]: PW_SETUP_COOKIE_VALUE,
        },
      })
    );

    expect(mockSignOut).not.toHaveBeenCalled();
    // Not signed out, so no timeout redirect (the request proceeds normally).
    expect(res.headers.get("location")).toBeNull();
  });

  it("slides the last-active marker forward on an active authenticated request", async () => {
    setSession(true);
    // A recent (non-expired) marker: no sign-out, just a bump.
    const recent = String(Date.now() - 1000);
    const res = await updateSupabaseSession(
      request("/admin", { cookies: { [IDLE_COOKIE]: recent } })
    );

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBeNull();
    const bumped = res.cookies.get(IDLE_COOKIE);
    expect(bumped?.value).toBeDefined();
    expect(Number.isFinite(Number(bumped?.value))).toBe(true);
    expect(Number(bumped?.value)).toBeGreaterThanOrEqual(Number(recent));
  });

  it("starts a window on a first authenticated request with no marker", async () => {
    setSession(true);
    const res = await updateSupabaseSession(request("/admin"));

    expect(mockSignOut).not.toHaveBeenCalled();
    const set = res.cookies.get(IDLE_COOKIE);
    expect(Number.isFinite(Number(set?.value))).toBe(true);
  });

  it("never signs out or sets a marker for an anonymous request", async () => {
    setSession(false);
    const res = await updateSupabaseSession(
      request("/admin", { cookies: { [IDLE_COOKIE]: expiredIdleValue() } })
    );

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.cookies.get(IDLE_COOKIE)).toBeUndefined();
  });

  it("does not enforce the timeout on the /auth/confirm verify handshake", async () => {
    for (const qs of ["code=abc", "token_hash=xyz&type=recovery"]) {
      setSession(true);
      const res = await updateSupabaseSession(
        request(`/auth/confirm?${qs}`, {
          cookies: { [IDLE_COOKIE]: expiredIdleValue() },
        })
      );
      expect(mockSignOut).not.toHaveBeenCalled();
      // No timeout redirect: the verify handshake is left to its own flow.
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("signs out a stale session landing on /reset-password with a link token", async () => {
    // /reset-password renders the password form for ANY existing session before
    // the link token is consumed, so a stale idle session must be signed out
    // first — it is NOT waived like the other callback paths.
    for (const qs of ["code=abc", "token_hash=xyz&type=recovery"]) {
      setSession(true);
      const res = await updateSupabaseSession(
        request(`/reset-password?${qs}`, {
          cookies: { [IDLE_COOKIE]: expiredIdleValue() },
        })
      );
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(
        `${ORIGIN}/login?reason=timeout`
      );
    }
  });
});

describe("updateSupabaseSession landing-hint fast path", () => {
  it("redirects an authenticated `/` with a valid hint straight to the surface", async () => {
    setSession(true);
    const res = await updateSupabaseSession(
      request("/", { cookies: { [LANDING_HINT_COOKIE]: "/admin" } })
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/admin`);
  });

  it("routes each role's hint to its own surface", async () => {
    for (const hint of ["/admin", "/leader", "/over-shepherd"]) {
      setSession(true);
      const res = await updateSupabaseSession(
        request("/", { cookies: { [LANDING_HINT_COOKIE]: hint } })
      );
      expect(res.headers.get("location")).toBe(`${ORIGIN}${hint}`);
    }
  });

  it("ignores an invalid hint and does not redirect (falls through to `/`)", async () => {
    setSession(true);
    const res = await updateSupabaseSession(
      request("/", { cookies: { [LANDING_HINT_COOKIE]: "/admin/groups" } })
    );

    // No redirect: authenticated `/` continues to the dynamic Home Hub.
    expect(res.headers.get("location")).toBeNull();
  });

  it("ignores a missing hint", async () => {
    setSession(true);
    const res = await updateSupabaseSession(request("/"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("does not hijack an auth callback landing on `/` (code / token_hash)", async () => {
    for (const qs of ["code=abc", "token_hash=xyz&type=recovery"]) {
      setSession(true);
      const res = await updateSupabaseSession(
        request(`/?${qs}`, { cookies: { [LANDING_HINT_COOKIE]: "/admin" } })
      );
      // The hint must not steal the email-link callback off `/`.
      expect(res.headers.get("location")).not.toBe(`${ORIGIN}/admin`);
    }
  });

  it("only fires on GET, never on a POST to `/`", async () => {
    setSession(true);
    const res = await updateSupabaseSession(
      request("/", {
        method: "POST",
        cookies: { [LANDING_HINT_COOKIE]: "/admin" },
      })
    );

    expect(res.headers.get("location")).toBeNull();
  });

  it("still rewrites anonymous `/` to the static login page (hint ignored)", async () => {
    setSession(false);
    const res = await updateSupabaseSession(
      // A leftover hint from a prior session must not redirect an anonymous user.
      request("/", { cookies: { [LANDING_HINT_COOKIE]: "/admin" } })
    );

    // Rewrite (not redirect): address bar stays at `/`, body is /login.
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toContain("/login");
  });

  // The hint is non-authoritative: even when it routes to a surface the user
  // can't access, the destination's own route guard (requireAdmin /
  // requireLeader / requireOverShepherd, switching on the live getCurrentSession)
  // still denies access. That guard behavior is covered by
  // lib/auth/__tests__/session.test.ts; middleware only performs the redirect.
});

describe("updateSupabaseSession stale-hint self-heal", () => {
  it("clears the hint when an authenticated request lands on /unauthorized", async () => {
    // A role guard denied access (e.g. role changed since the cookie was set);
    // the stale hint must be cleared so /unauthorized → `/` doesn't loop back
    // through the same redirect.
    setSession(true);
    const res = await updateSupabaseSession(
      request("/unauthorized", { cookies: { [LANDING_HINT_COOKIE]: "/admin" } })
    );

    const cleared = res.cookies.get(LANDING_HINT_COOKIE);
    expect(cleared?.value).toBe("");
    expect(cleared?.maxAge).toBe(0);
  });

  it("does not touch cookies on /unauthorized when no hint is present", async () => {
    setSession(true);
    const res = await updateSupabaseSession(request("/unauthorized"));

    expect(res.cookies.get(LANDING_HINT_COOKIE)).toBeUndefined();
  });
});
