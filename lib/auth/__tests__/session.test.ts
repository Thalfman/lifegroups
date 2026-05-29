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

// IDs must be UUIDs — the session-path trust-boundary guard validates
// shape including UUID format on profile.id and group_leaders.group_id.
const PROFILE_ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const PROFILE_LEADER_ID = "22222222-2222-2222-2222-222222222222";
const AUTH_ADMIN_ID = "33333333-3333-3333-3333-333333333333";
const AUTH_LEADER_ID = "44444444-4444-4444-4444-444444444444";
const GROUP_1_ID = "55555555-5555-5555-5555-555555555555";
const GROUP_2_ID = "66666666-6666-6666-6666-666666666666";

const PROFILE_ADMIN: ProfileFixture = {
  id: PROFILE_ADMIN_ID,
  auth_user_id: AUTH_ADMIN_ID,
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
  id: PROFILE_LEADER_ID,
  auth_user_id: AUTH_LEADER_ID,
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
        leaderRows: [{ group_id: GROUP_1_ID }, { group_id: GROUP_2_ID }],
      }),
    );
    const { requireRole } = await loadSession();
    const result = await requireRole(["leader"]);
    expect(result.assignedGroupIds).toEqual([GROUP_1_ID, GROUP_2_ID]);
  });
});

describe("trust-boundary guards", () => {
  it("treats a malformed profile row as backend_error", async () => {
    const malformed = {
      id: PROFILE_ADMIN_ID,
      auth_user_id: AUTH_ADMIN_ID,
      // Role is not one of the documented UserRole literals.
      role: "not_a_role",
      status: "active",
    };
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-admin", email: "admin@example.com" },
        profile: malformed as unknown as ProfileFixture,
      }),
    );
    const { requireRole } = await loadSession();
    await expect(requireRole(["ministry_admin"])).rejects.toMatchObject({
      __redirect: "/unauthorized?reason=unavailable",
    });
    const { log } = await import("@/lib/observability/logger");
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: "profile_shape_invalid" }),
    );
  });

  it("treats malformed leader rows as backend_error", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-leader", email: "leader@example.com" },
        profile: PROFILE_LEADER,
        leaderRows: [{ group_id: 42 }] as unknown as { group_id: string }[],
      }),
    );
    const { requireRole } = await loadSession();
    await expect(requireRole(["leader"])).rejects.toMatchObject({
      __redirect: "/unauthorized?reason=unavailable",
    });
    const { log } = await import("@/lib/observability/logger");
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: "leader_rows_shape_invalid" }),
    );
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

// Shepherd (leader) surface gated per
// docs/adr/0002-oversight-ladder-and-leader-gating.md: the shared guards now
// deny every caller before any RPC, so the dormant leader surface is
// unreachable. These tests pin that no-access behavior.
describe("requireLeader (page-route guard) -- gated", () => {
  it("redirects a leader caller to /unauthorized", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-leader", email: "leader@example.com" },
        profile: PROFILE_LEADER,
        leaderRows: [{ group_id: GROUP_1_ID }],
      }),
    );
    const { requireLeader } = await loadSession();
    await expect(requireLeader()).rejects.toMatchObject({
      __redirect: "/unauthorized",
    });
  });

  it("redirects an admin caller to /unauthorized too (no role admitted)", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-admin", email: "admin@example.com" },
        profile: PROFILE_ADMIN,
      }),
    );
    const { requireLeader } = await loadSession();
    await expect(requireLeader()).rejects.toMatchObject({
      __redirect: "/unauthorized",
    });
  });
});

describe("requireLeaderActor (server-action guard) -- gated", () => {
  it("denies a leader caller before any RPC", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-leader", email: "leader@example.com" },
        profile: PROFILE_LEADER,
        leaderRows: [{ group_id: GROUP_1_ID }],
      }),
    );
    const { requireLeaderActor } = await loadSession();
    const r = await requireLeaderActor();
    expect(r.ok).toBe(false);
  });

  it("returns ok:false on backend_error from the profile lookup", async () => {
    mockCreateClient.mockResolvedValueOnce(
      makeClient({
        user: { id: "auth-leader", email: "leader@example.com" },
        profileError: { code: "PGRST", message: "transient" },
      }),
    );
    const { requireLeaderActor } = await loadSession();
    const r = await requireLeaderActor();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/temporarily unavailable/i);
    }
  });

  it("denies an admin caller", async () => {
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
