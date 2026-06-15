import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockCookieSet, mockLogUsage } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCookieSet: vi.fn(),
  mockLogUsage: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mockCookieSet }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("@/lib/usage/rpc", () => ({
  rpcLogUsageEvent: mockLogUsage,
}));

vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { loginAction } from "../actions";

const AUTH_ID = "55555555-5555-5555-5555-555555555555";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

type Profile = { role: string; status: string } | null;

function makeClient(opts: {
  signInError?: { code?: string; status?: number } | null;
  user?: { id: string } | null;
  profile?: Profile;
  profileError?: { code?: string; message: string } | null;
}) {
  const signOut = vi.fn(async () => ({ error: null }));
  const signInWithPassword = vi.fn(async () => ({
    error: opts.signInError ?? null,
  }));
  const client = {
    auth: {
      signInWithPassword,
      getUser: async () => ({
        data: { user: opts.user === undefined ? { id: AUTH_ID } : opts.user },
      }),
      signOut,
    },
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: opts.profile ?? null,
          error: opts.profileError ?? null,
        }),
      };
      return builder;
    },
  };
  return { client, signInWithPassword, signOut };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLogUsage.mockResolvedValue(undefined);
});

describe("loginAction", () => {
  it("requires both email and password before hitting Supabase", async () => {
    const { client, signInWithPassword } = makeClient({});
    mockCreateClient.mockResolvedValue(client);

    const state = await loginAction({}, form({ email: "person@example.com" }));

    expect(state.error).toMatch(/required/i);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns a generic error on bad credentials", async () => {
    const { client, signOut } = makeClient({
      signInError: { code: "invalid_credentials", status: 400 },
    });
    mockCreateClient.mockResolvedValue(client);

    const state = await loginAction(
      {},
      form({ email: "person@example.com", password: "wrong" })
    );

    expect(state.error).toMatch(/invalid email or password/i);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("clears the setup-gate cookie and redirects an active profile", async () => {
    const { client } = makeClient({
      profile: { role: "ministry_admin", status: "active" },
    });
    mockCreateClient.mockResolvedValue(client);

    await expect(
      loginAction(
        {},
        form({
          email: "person@example.com",
          password: "secretpass",
          next: "/admin/groups",
        })
      )
    ).rejects.toThrow("redirect:/admin/groups");

    expect(mockCookieSet).toHaveBeenCalled();
    expect(mockLogUsage).toHaveBeenCalled();
  });

  it("sends an inactive profile to /unauthorized", async () => {
    const { client } = makeClient({
      profile: { role: "leader", status: "inactive" },
    });
    mockCreateClient.mockResolvedValue(client);

    await expect(
      loginAction(
        {},
        form({ email: "person@example.com", password: "secretpass" })
      )
    ).rejects.toThrow("redirect:/unauthorized");
  });

  it("signs back out and reports a friendly error on profile lookup failure", async () => {
    const { client, signOut } = makeClient({
      profile: null,
      profileError: { code: "PGRST", message: "boom" },
    });
    mockCreateClient.mockResolvedValue(client);

    const state = await loginAction(
      {},
      form({ email: "person@example.com", password: "secretpass" })
    );

    expect(state.error).toMatch(/couldn't load your profile/i);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
