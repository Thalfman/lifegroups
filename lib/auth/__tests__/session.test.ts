import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    const err = new Error(`redirect:${path}`);
    (err as Error & { __redirect?: string }).__redirect = path;
    throw err;
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type ProfileFixture = {
  id: string;
  auth_user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: "super_admin" | "ministry_admin" | "leader" | "co_leader" | "staff_viewer";
  status: "active" | "inactive" | "invited";
  created_at: string;
  updated_at: string;
};

const PROFILE_ADMIN: ProfileFixture = {
  id: "p-admin",
  auth_user_id: "auth-admin",
  full_name: "Admin A",
  email: "admin@example.com",
  phone: null,
  role: "ministry_admin",
  status: "active",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const PROFILE_LEADER: ProfileFixture = {
  ...PROFILE_ADMIN,
  id: "p-leader",
  auth_user_id: "auth-leader",
  email: "leader@example.com",
  role: "leader",
};

type ClientState = {
  user: { id: string; email: string | null } | null;
  profile?: ProfileFixture | null;
  profileError?: { code?: string; message: string } | null;
  leaderRows?: { group_id: string }[] | null;
  leaderError?: { code?: string; message: string } | null;
};

// Stub builder mirrors the chain shape used by getCurrentSession in
// lib/auth/session.ts: `.from(t).select(...).eq(...).maybeSingle()` for
// profiles, and `.from(t).select(...).eq(...).eq(...)` (awaited directly)
// for group_leaders. The builder is also a thenable so the multi-row
// terminal await works.
function makeClient(state: ClientState) {
  return {
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        async maybeSingle() {
          if (table === "profiles") {
            return {
              data: state.profile ?? null,
              error: state.profileError ?? null,
            };
          }
          throw new Error(`maybeSingle not stubbed for table ${table}`);
        },
        then<R1, R2>(
          onResolve: (
            value: { data: unknown; error: unknown },
          ) => R1 | PromiseLike<R1>,
          onReject?: (reason: unknown) => R2 | PromiseLike<R2>,
        ) {
          if (table === "group_leaders") {
            return Promise.resolve({
              data: state.leaderRows ?? [],
              error: state.leaderError ?? null,
            }).then(onResolve, onReject);
          }
          return Promise.reject(
            new Error(`await on builder not stubbed for table ${table}`),
          ).then(onResolve, onReject);
        },
      };
      return builder;
    },
  };
}

async function loadSession() {
  return await import("@/lib/auth/session");
}

beforeEach(() => {
  vi.resetModules();
  mockCreateClient.mockReset();
});

describe("requireRole (page-route guard)", () => {
  it("redirects anonymous users to /login", async () => {
    mockCreateClient.mockResolvedValueOnce(makeClient({ user: null }));
    const { requireRole } = await loadSession();
    await expect(requireRole(["ministry_admin"])).rejects.toMatchObject({
      __redirect: "/login",
    });
  });

  it("redirects users without a profile to /unauthorized", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-admin", email: "admin@example.com" },
        profile: null,
      }),
    );
    const { requireRole } = await loadSession();
    await expect(requireRole(["ministry_admin"])).rejects.toMatchObject({
      __redirect: "/unauthorized",
    });
  });

  it("redirects backend_error to /unauthorized?reason=unavailable", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-admin", email: "admin@example.com" },
        profileError: { code: "PGRST", message: "transient" },
      }),
    );
    const { requireRole } = await loadSession();
    await expect(requireRole(["ministry_admin"])).rejects.toMatchObject({
      __redirect: "/unauthorized?reason=unavailable",
    });
  });

  it("redirects inactive profiles to /unauthorized", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-admin", email: "admin@example.com" },
        profile: { ...PROFILE_ADMIN, status: "inactive" },
      }),
    );
    const { requireRole } = await loadSession();
    await expect(requireRole(["ministry_admin"])).rejects.toMatchObject({
      __redirect: "/unauthorized",
    });
  });

  it("redirects when the actor's role isn't in the allowed list", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-leader", email: "leader@example.com" },
        profile: PROFILE_LEADER,
        leaderRows: [],
      }),
    );
    const { requireRole } = await loadSession();
    await expect(requireRole(["ministry_admin"])).rejects.toMatchObject({
      __redirect: "/unauthorized",
    });
  });

  it("returns the session for an authenticated allowed role", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-admin", email: "admin@example.com" },
        profile: PROFILE_ADMIN,
      }),
    );
    const { requireRole } = await loadSession();
    const result = await requireRole(["ministry_admin"]);
    expect(result.kind).toBe("authenticated");
    expect(result.profile.role).toBe("ministry_admin");
    expect(result.assignedGroupIds).toEqual([]);
  });

  it("collects assigned group ids for a leader actor", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-leader", email: "leader@example.com" },
        profile: PROFILE_LEADER,
        leaderRows: [{ group_id: "g1" }, { group_id: "g2" }],
      }),
    );
    const { requireRole } = await loadSession();
    const result = await requireRole(["leader"]);
    expect(result.assignedGroupIds).toEqual(["g1", "g2"]);
  });
});

describe("requireAdminSession (server-action guard)", () => {
  it("returns ok:false on backend_error with a generic transient message", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-admin", email: "admin@example.com" },
        profileError: { code: "PGRST", message: "transient" },
      }),
    );
    const { requireAdminSession } = await loadSession();
    const r = await requireAdminSession();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/temporarily unavailable/i);
    }
  });

  it("returns ok:false when anonymous", async () => {
    mockCreateClient.mockResolvedValueOnce(makeClient({ user: null }));
    const { requireAdminSession } = await loadSession();
    const r = await requireAdminSession();
    expect(r.ok).toBe(false);
  });

  it("returns ok:false for a leader caller", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-leader", email: "leader@example.com" },
        profile: PROFILE_LEADER,
        leaderRows: [],
      }),
    );
    const { requireAdminSession } = await loadSession();
    const r = await requireAdminSession();
    expect(r.ok).toBe(false);
  });

  it("returns ok:true for an active admin", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-admin", email: "admin@example.com" },
        profile: PROFILE_ADMIN,
      }),
    );
    const { requireAdminSession } = await loadSession();
    const r = await requireAdminSession();
    expect(r.ok).toBe(true);
  });
});

describe("requireLeaderActor (server-action guard)", () => {
  it("returns ok:true with assigned group ids for a leader", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-leader", email: "leader@example.com" },
        profile: PROFILE_LEADER,
        leaderRows: [{ group_id: "g1" }],
      }),
    );
    const { requireLeaderActor } = await loadSession();
    const r = await requireLeaderActor();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profileId).toBe("p-leader");
      expect(r.assignedGroupIds).toEqual(["g1"]);
    }
  });

  it("returns ok:false on backend_error from leader_assignments lookup", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-leader", email: "leader@example.com" },
        profile: PROFILE_LEADER,
        leaderError: { code: "PGRST", message: "transient" },
      }),
    );
    const { requireLeaderActor } = await loadSession();
    const r = await requireLeaderActor();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/temporarily unavailable/i);
    }
  });

  it("rejects an admin caller", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-admin", email: "admin@example.com" },
        profile: PROFILE_ADMIN,
      }),
    );
    const { requireLeaderActor } = await loadSession();
    const r = await requireLeaderActor();
    expect(r.ok).toBe(false);
  });
});
