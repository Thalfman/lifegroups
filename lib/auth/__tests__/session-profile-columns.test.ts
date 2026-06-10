import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockReadFrozenSurfaceFlag } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockReadFrozenSurfaceFlag: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("@/lib/auth/leader-surface-flag", () => ({
  readFrozenSurfaceFlagForLeader: mockReadFrozenSurfaceFlag,
}));

vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Pins the session profile column allowlist (#492). The session lookup runs
// on every protected request, so this is the trust seam where a broad
// select("*") would ship every current AND future profiles column on every
// page load. These tests freeze the allowlist to exactly the columns the
// session/role guards and downstream session consumers use: adding a column
// to profiles (or to the allowlist) cannot silently widen the read — it has
// to show up here as a deliberate diff.
const PINNED_SESSION_PROFILE_COLUMNS = [
  "id",
  "auth_user_id",
  "full_name",
  "full_name_pending", // deliberate widening: choose-your-name gate (ADR 0025)
  "email",
  "role",
  "status",
] as const;

const PROFILE_FIXTURE = {
  id: "11111111-1111-1111-1111-111111111111",
  auth_user_id: "33333333-3333-3333-3333-333333333333",
  full_name: "Admin A",
  full_name_pending: false,
  email: "admin@example.com",
  role: "ministry_admin",
  status: "active",
};

// Minimal client stub mirroring the chain shape used by getCurrentSession
// (`.from(t).select(...).eq(...).maybeSingle()`), but capturing the argument
// passed to select() per table so the test can assert the live read uses the
// allowlist — not just that the exported constant looks right.
function makeSelectCapturingClient(selectCalls: Map<string, unknown[]>) {
  return {
    auth: {
      getUser: async () => ({
        data: {
          user: { id: PROFILE_FIXTURE.auth_user_id, email: null },
        },
        error: null,
      }),
    },
    from(table: string) {
      const builder = {
        select(...args: unknown[]) {
          const calls = selectCalls.get(table) ?? [];
          calls.push(args[0]);
          selectCalls.set(table, calls);
          return builder;
        },
        eq() {
          return builder;
        },
        async maybeSingle() {
          if (table === "profiles") {
            return { data: PROFILE_FIXTURE, error: null };
          }
          throw new Error(`maybeSingle not stubbed for table ${table}`);
        },
      };
      return builder;
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  mockCreateClient.mockReset();
  mockReadFrozenSurfaceFlag.mockReset();
  mockReadFrozenSurfaceFlag.mockResolvedValue(true);
});

describe("session profile column allowlist (#492)", () => {
  it("pins the exact allowlist — widening the session read must be a deliberate diff here", async () => {
    const { SESSION_PROFILE_COLUMNS } = await import("@/lib/auth/session");
    expect([...SESSION_PROFILE_COLUMNS]).toEqual([
      ...PINNED_SESSION_PROFILE_COLUMNS,
    ]);
  });

  it("never selects '*'", async () => {
    const { SESSION_PROFILE_COLUMNS } = await import("@/lib/auth/session");
    expect(SESSION_PROFILE_COLUMNS).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the profiles read", async () => {
    const selectCalls = new Map<string, unknown[]>();
    mockCreateClient.mockResolvedValueOnce(
      makeSelectCapturingClient(selectCalls)
    );
    const { getCurrentSession } = await import("@/lib/auth/session");

    const session = await getCurrentSession();
    expect(session.kind).toBe("authenticated");

    expect(selectCalls.get("profiles")).toEqual([
      PINNED_SESSION_PROFILE_COLUMNS.join(", "),
    ]);
  });
});
