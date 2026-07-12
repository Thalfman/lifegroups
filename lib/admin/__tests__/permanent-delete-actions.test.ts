import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSuperAdminSession,
  mockCreateClient,
  mockRevalidatePath,
  mockLogWarn,
} = vi.hoisted(() => ({
  mockRequireSuperAdminSession: vi.fn(),
  mockCreateClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockLogWarn: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireSuperAdminSession: mockRequireSuperAdminSession,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: mockLogWarn, error: vi.fn() },
}));

import {
  superAdminPermanentDelete,
  superAdminLoadPermanentDeletionTargets,
  superAdminPermanentDeletePreflight,
  superAdminRestoreTombstone,
} from "@/app/(protected)/admin/super-admin/permanent-delete-actions";

const SCENARIO = "22222222-2222-2222-2222-222222222222";
const TOMBSTONE = "33333333-3333-3333-3333-333333333333";
const BLOCKER_ID = "44444444-4444-4444-8444-444444444444";

let rpc: ReturnType<typeof vi.fn>;
let from: ReturnType<typeof vi.fn>;
let blockerReadResponse: { data: unknown[] | null; error: unknown };
let blockerReadCalls: Array<[string, ...unknown[]]>;
let invoke: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  rpc = vi.fn();
  invoke = vi.fn();
  blockerReadResponse = { data: [], error: null };
  blockerReadCalls = [];
  let blockerBuilder: Record<string, unknown>;
  blockerBuilder = new Proxy(
    {
      then: (
        onFulfilled: (value: unknown) => unknown,
        onRejected: (error: unknown) => unknown
      ) => Promise.resolve(blockerReadResponse).then(onFulfilled, onRejected),
    },
    {
      get(target, property) {
        if (property in target) return target[property as keyof typeof target];
        return (...args: unknown[]) => {
          blockerReadCalls.push([String(property), ...args]);
          return blockerBuilder;
        };
      },
    }
  );
  from = vi.fn().mockReturnValue(blockerBuilder);
  mockRequireSuperAdminSession.mockResolvedValue({
    ok: true,
    session: {
      profile: {
        id: "11111111-1111-1111-1111-111111111111",
        role: "super_admin",
      },
    },
  });
  mockCreateClient.mockResolvedValue({ rpc, from, functions: { invoke } });
});

describe("superAdminLoadPermanentDeletionTargets", () => {
  it("loads only the chosen entity page and exposes stable pagination", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      name: `Scenario ${index}`,
      is_current: false,
      archived_at: null,
    }));
    const range = vi.fn().mockResolvedValue({ data: rows, error: null });
    const query = {
      select: vi.fn(),
      order: vi.fn(),
      range,
    };
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    const from = vi.fn().mockReturnValue(query);
    mockCreateClient.mockResolvedValueOnce({ from });

    const result = await superAdminLoadPermanentDeletionTargets(undefined, {
      entityType: "launch_scenario",
      page: "2",
    });

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("launch_planning_scenarios");
    expect(range).toHaveBeenCalledWith(100, 150);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        entityType: "launch_scenario",
        page: 2,
        hasPrevious: true,
        hasNext: true,
      });
      expect(result.value.items).toHaveLength(50);
    }
  });
});

describe("superAdminPermanentDelete", () => {
  it("rejects a non-super-admin session before touching the database", async () => {
    mockRequireSuperAdminSession.mockResolvedValueOnce({
      ok: false,
      error: "Not allowed.",
    });
    const result = await superAdminPermanentDelete(undefined, {
      entityType: "launch_scenario",
      id: SCENARIO,
      confirm: "PERMANENTLY DELETE",
    });
    expect(result.ok).toBe(false);
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an incorrect confirm phrase without calling the RPC", async () => {
    const result = await superAdminPermanentDelete(undefined, {
      entityType: "launch_scenario",
      id: SCENARIO,
      confirm: "delete it",
    });
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an unregistered entity type", async () => {
    const result = await superAdminPermanentDelete(undefined, {
      entityType: "audit_events",
      id: SCENARIO,
      confirm: "PERMANENTLY DELETE",
    });
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("runs the delete RPC on the happy path and returns the tombstone id", async () => {
    rpc.mockResolvedValue({ data: TOMBSTONE, error: null });
    const result = await superAdminPermanentDelete(undefined, {
      entityType: "launch_scenario",
      id: SCENARIO,
      confirm: "PERMANENTLY DELETE",
    });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("super_admin_permanent_delete", {
      p_entity_type: "launch_scenario",
      p_id: SCENARIO,
    });
    if (result.ok) {
      expect(result.value.tombstoneId).toBe(TOMBSTONE);
      expect(result.value.entityType).toBe("launch_scenario");
    }
  });

  it("routes profile deletion through the service-role Edge Function", async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        code: "ok",
        profileId: SCENARIO,
        tombstoneId: TOMBSTONE,
        authUserState: "deleted",
        warnings: [],
        errors: [],
      },
      error: null,
    });

    const result = await superAdminPermanentDelete(undefined, {
      entityType: "profile",
      id: SCENARIO,
      confirm: "PERMANENTLY DELETE",
    });

    expect(result.ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith("purge-profile-auth", {
      body: { profileId: SCENARIO },
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/super-admin");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
    if (result.ok) {
      expect(result.value).toEqual({
        entityType: "profile",
        entityId: SCENARIO,
        tombstoneId: TOMBSTONE,
      });
    }
  });

  it("keeps a committed profile deletion successful when one cache refresh fails", async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        code: "ok",
        profileId: SCENARIO,
        tombstoneId: TOMBSTONE,
        authUserState: "deleted",
        warnings: [],
        errors: [],
      },
      error: null,
    });
    mockRevalidatePath.mockImplementationOnce(() => {
      throw new Error("private cache backend detail");
    });

    const result = await superAdminPermanentDelete(undefined, {
      entityType: "profile",
      id: SCENARIO,
      confirm: "PERMANENTLY DELETE",
    });

    expect(result.ok).toBe(true);
    expect(mockRevalidatePath.mock.calls).toEqual([
      ["/admin/super-admin"],
      ["/admin/people"],
      ["/admin"],
    ]);
    expect(mockLogWarn).toHaveBeenCalledWith({
      event: "action_revalidation_failed",
      route_or_action: "super_admin.permanent_delete_profile",
      outcome: "fail",
      error_code: "revalidation_failed",
      revalidate_path: "/admin/super-admin",
    });
    expect(JSON.stringify(mockLogWarn.mock.calls)).not.toContain(
      "private cache backend detail"
    );
  });

  it("rethrows Next control-flow errors from profile deletion revalidation", async () => {
    const navigation = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/admin;303;",
    });
    invoke.mockResolvedValue({
      data: {
        ok: true,
        code: "ok",
        profileId: SCENARIO,
        tombstoneId: TOMBSTONE,
        authUserState: "deleted",
        warnings: [],
        errors: [],
      },
      error: null,
    });
    mockRevalidatePath.mockImplementationOnce(() => {
      throw navigation;
    });

    await expect(
      superAdminPermanentDelete(undefined, {
        entityType: "profile",
        id: SCENARIO,
        confirm: "PERMANENTLY DELETE",
      })
    ).rejects.toBe(navigation);
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1);
    expect(mockLogWarn).not.toHaveBeenCalled();
  });

  it("surfaces a retriable partial failure without revalidating the queue", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({
            ok: false,
            code: "auth_delete_failed",
            profileId: SCENARIO,
            tombstoneId: TOMBSTONE,
            warnings: ["database_profile_purge_completed"],
            errors: ["auth_delete_failed"],
          }),
          { status: 502 }
        ),
      },
    });

    const result = await superAdminPermanentDelete(undefined, {
      entityType: "profile",
      id: SCENARIO,
      confirm: "PERMANENTLY DELETE",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/profile was purged/i);
      expect(result.errors.join(" ")).toMatch(/resume from the tombstone/i);
    }
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("maps an RPC blocker error to friendly copy", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "has_blocking_dependents" },
    });
    const result = await superAdminPermanentDelete(undefined, {
      entityType: "group",
      id: SCENARIO,
      confirm: "PERMANENTLY DELETE",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/dependent/i);
    }
  });
});

describe("superAdminPermanentDeletePreflight", () => {
  it("parses the jsonb report (blockers + set-null counts)", async () => {
    rpc.mockResolvedValue({
      data: {
        deletable: false,
        forbidden: false,
        confidential: false,
        blockers: [
          { table: "group_leaders", column: "group_id", action: "c", count: 3 },
        ],
        set_null: [
          { table: "follow_ups", column: "related_group_id", count: 2 },
        ],
      },
      error: null,
    });
    const result = await superAdminPermanentDeletePreflight(undefined, {
      entityType: "group",
      id: SCENARIO,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entityType).toBe("group");
      expect(result.value.entityId).toBe(SCENARIO);
      expect(result.value.deletable).toBe(false);
      expect(result.value.blockers).toHaveLength(1);
      expect(result.value.blockers[0].count).toBe(3);
      expect(result.value.setNull[0].count).toBe(2);
      // A report without the #880 cleanup key degrades to an empty bucket.
      expect(result.value.cleanup).toEqual([]);
    }
  });

  it("enriches registered blockers with RLS-protected target IDs", async () => {
    blockerReadResponse = { data: [{ id: BLOCKER_ID }], error: null };
    rpc.mockResolvedValue({
      data: {
        deletable: false,
        forbidden: false,
        confidential: false,
        blockers: [
          {
            table: "group_memberships",
            column: "group_id",
            action: "c",
            count: 12,
          },
        ],
        set_null: [],
      },
      error: null,
    });

    const result = await superAdminPermanentDeletePreflight(undefined, {
      entityType: "group",
      id: SCENARIO,
    });

    expect(from).toHaveBeenCalledWith("group_memberships");
    expect(blockerReadCalls).toContainEqual(["select", "id"]);
    expect(blockerReadCalls).toContainEqual(["eq", "group_id", SCENARIO]);
    expect(blockerReadCalls).toContainEqual(["limit", 10]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.blockers[0]).toMatchObject({
        entityType: "group_membership",
        ids: [BLOCKER_ID],
      });
    }
  });
  it("parses the #880 cleanup bucket without letting it gate deletable", async () => {
    // An encumbered profile: the engine cleans these up in-transaction, so the
    // preflight reports them as cleanup — announced work, not blockers.
    rpc.mockResolvedValue({
      data: {
        deletable: true,
        forbidden: false,
        confidential: false,
        blockers: [],
        cleanup: [
          { table: "group_leaders", column: "profile_id", count: 1 },
          {
            table: "shepherd_coverage_assignments",
            column: "shepherd_profile_id",
            count: 1,
          },
        ],
        set_null: [
          { table: "care_notes", column: "author_profile_id", count: 2 },
        ],
      },
      error: null,
    });
    const result = await superAdminPermanentDeletePreflight(undefined, {
      entityType: "profile",
      id: SCENARIO,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.deletable).toBe(true);
      expect(result.value.blockers).toHaveLength(0);
      expect(result.value.cleanup).toEqual([
        { table: "group_leaders", column: "profile_id", count: 1 },
        {
          table: "shepherd_coverage_assignments",
          column: "shepherd_profile_id",
          count: 1,
        },
      ]);
      expect(result.value.setNull[0]).toEqual({
        table: "care_notes",
        column: "author_profile_id",
        count: 2,
      });
    }
  });

  it("surfaces the opaque confidential block with no blocker detail", async () => {
    rpc.mockResolvedValue({
      data: { deletable: false, confidential: true },
      error: null,
    });
    const result = await superAdminPermanentDeletePreflight(undefined, {
      entityType: "profile",
      id: SCENARIO,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entityType).toBe("profile");
      expect(result.value.entityId).toBe(SCENARIO);
      expect(result.value.confidential).toBe(true);
      expect(result.value.blockers).toHaveLength(0);
    }
  });
});

describe("superAdminRestoreTombstone", () => {
  it("rejects an incorrect restore phrase without calling the RPC", async () => {
    const result = await superAdminRestoreTombstone(undefined, {
      tombstoneId: TOMBSTONE,
      confirm: "restore",
    });
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("restores on the happy path and returns the relink counts", async () => {
    rpc.mockResolvedValue({
      data: {
        tombstone_id: TOMBSTONE,
        entity_type: "launch_scenario",
        entity_id: SCENARIO,
        relinked: 2,
        skipped: 1,
      },
      error: null,
    });
    const result = await superAdminRestoreTombstone(undefined, {
      tombstoneId: TOMBSTONE,
      confirm: "RESTORE RECORD",
    });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("super_admin_restore_tombstone", {
      p_tombstone_id: TOMBSTONE,
    });
    if (result.ok) {
      expect(result.value.relinked).toBe(2);
      expect(result.value.skipped).toBe(1);
      expect(result.value.entityId).toBe(SCENARIO);
    }
  });

  it("maps an id-conflict error to friendly copy", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "id_already_exists" },
    });
    const result = await superAdminRestoreTombstone(undefined, {
      tombstoneId: TOMBSTONE,
      confirm: "RESTORE RECORD",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/already exists/i);
    }
  });
});
