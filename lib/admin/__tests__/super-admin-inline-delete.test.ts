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

import { superAdminInlineDelete } from "@/app/(protected)/admin/super-admin/permanent-delete-actions";

const ROW = "22222222-2222-2222-2222-222222222222";
const TOMBSTONE = "33333333-3333-3333-3333-333333333333";

let rpc: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  rpc = vi.fn();
  mockRequireSuperAdminSession.mockResolvedValue({ ok: true });
  mockCreateClient.mockResolvedValue({ rpc });
});

describe("superAdminInlineDelete", () => {
  it("rejects a non-super-admin session before touching the database", async () => {
    mockRequireSuperAdminSession.mockResolvedValueOnce({
      ok: false,
      error: "Only the super admin can perform that action.",
    });
    const result = await superAdminInlineDelete(undefined, {
      entityType: "shepherd_care_follow_up",
      id: ROW,
      path: "/admin/care",
    });
    expect(result.ok).toBe(false);
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an unregistered entity type without calling the RPC", async () => {
    const result = await superAdminInlineDelete(undefined, {
      entityType: "care_notes",
      id: ROW,
      path: "/admin/care",
    });
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([["launch_scenario"], ["invitation"], ["attendance_record"]])(
    "rejects a registered-but-non-inline type %s (no-phrase scope)",
    async (entityType) => {
      // These are valid danger-zone targets, but the inline control never
      // renders them — so the no-phrase action must refuse them even though the
      // shared readTarget validator accepts the whole registry.
      const result = await superAdminInlineDelete(undefined, {
        entityType,
        id: ROW,
        path: "/admin/care",
      });
      expect(result.ok).toBe(false);
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it("rejects a non-uuid id without calling the RPC", async () => {
    const result = await superAdminInlineDelete(undefined, {
      entityType: "follow_up",
      id: "not-a-uuid",
      path: "/admin/care",
    });
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires NO confirm phrase — deletes on the happy path", async () => {
    rpc.mockResolvedValue({ data: TOMBSTONE, error: null });
    // Note: no `confirm` field at all.
    const result = await superAdminInlineDelete(undefined, {
      entityType: "follow_up",
      id: ROW,
      path: "/admin/care",
    });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("super_admin_permanent_delete", {
      p_entity_type: "follow_up",
      p_id: ROW,
    });
    if (result.ok) {
      expect(result.value.tombstoneId).toBe(TOMBSTONE);
      expect(result.value.entityType).toBe("follow_up");
    }
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/care");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
  });

  it.each([["shepherd_care_follow_up"], ["shepherd_care_interaction"]])(
    "accepts the new Care leaf token %s (SAD9)",
    async (entityType) => {
      rpc.mockResolvedValue({ data: TOMBSTONE, error: null });
      const result = await superAdminInlineDelete(undefined, {
        entityType,
        id: ROW,
        path: "/admin/care",
      });
      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith("super_admin_permanent_delete", {
        p_entity_type: entityType,
        p_id: ROW,
      });
    }
  );

  it("maps an RPC blocker error to friendly copy", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "has_blocking_dependents" },
    });
    const result = await superAdminInlineDelete(undefined, {
      entityType: "over_shepherd",
      id: ROW,
      path: "/admin/care",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/dependent/i);
    }
  });

  it("only revalidates an in-app /admin path (guards a forged path)", async () => {
    rpc.mockResolvedValue({ data: TOMBSTONE, error: null });
    const result = await superAdminInlineDelete(undefined, {
      entityType: "follow_up",
      id: ROW,
      path: "https://evil.example.com/admin",
    });
    expect(result.ok).toBe(true);
    // The forged path is never passed to revalidatePath; only /admin is.
    expect(mockRevalidatePath).not.toHaveBeenCalledWith(
      "https://evil.example.com/admin"
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1);
  });
});
