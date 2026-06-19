import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Control the Supabase client getClaims() returns and pretend env is configured.
const { mockCreateServerClient, mockGetClaims } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(),
  mockGetClaims: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mockCreateServerClient,
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabaseEnvSafe: () => ({ url: "https://supabase.test", key: "anon-key" }),
}));

import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { LANDING_HINT_COOKIE } from "@/lib/auth/landing-hint";

const ORIGIN = "https://app.test";

// authed=true → getClaims resolves a claims object (a logged-in session);
// authed=false → no claims (anonymous).
function setSession(authed: boolean) {
  mockGetClaims.mockResolvedValue({
    data: authed ? { claims: { sub: "user-1" } } : null,
  });
  mockCreateServerClient.mockReturnValue({
    auth: { getClaims: mockGetClaims },
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
