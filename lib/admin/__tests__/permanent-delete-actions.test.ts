import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireSuperAdminSession, mockCreateClient, mockRevalidatePath } =
  vi.hoisted(() => ({
    mockRequireSuperAdminSession: vi.fn(),
    mockCreateClient: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }));

vi.mock("@/lib/auth/session", () => ({
  requireSuperAdminSession: mockRequireSuperAdminSession,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  superAdminPermanentDelete,
  superAdminPermanentDeletePreflight,
  superAdminRestoreTombstone,
} from "@/app/(protected)/admin/super-admin/permanent-delete-actions";

const SCENARIO = "22222222-2222-2222-2222-222222222222";
const TOMBSTONE = "33333333-3333-3333-3333-333333333333";

let rpc: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  rpc = vi.fn();
  mockRequireSuperAdminSession.mockResolvedValue({
    ok: true,
    session: {
      profile: {
        id: "11111111-1111-1111-1111-111111111111",
        role: "super_admin",
      },
    },
  });
  mockCreateClient.mockResolvedValue({ rpc });
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
