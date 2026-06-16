import { beforeEach, describe, expect, it, vi } from "vitest";

// Bug fix: a reset that finds NOTHING to clear must read as a neutral no-op, not
// a red error. The history-clearing RPCs raise `nothing_to_wipe` when the target
// is already empty; the actions reclassify exactly that raw token as a
// successful no-op (nothingToClear: true) while every OTHER token — including a
// genuine failure — still fails. These tests are the regression guard that the
// reclassification stays scoped to the no-op token and never masks real errors.

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

import { superAdminCleanSlateWipe } from "@/app/(protected)/admin/super-admin/clean-slate-actions";
import { superAdminResetHistoryCategory } from "@/app/(protected)/admin/super-admin/history-reset-actions";

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

describe("superAdminCleanSlateWipe — nothing_to_wipe no-op", () => {
  it("treats nothing_to_wipe as a neutral success, not an error", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "nothing_to_wipe" },
    });
    const result = await superAdminCleanSlateWipe(undefined, {
      confirm: "CLEAR HISTORY",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nothingToClear).toBe(true);
      expect(result.value.totalRows).toBe(0);
    }
  });

  it("still fails on any other RPC error (e.g. insufficient_privilege)", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "insufficient_privilege" },
    });
    const result = await superAdminCleanSlateWipe(undefined, {
      confirm: "CLEAR HISTORY",
    });
    expect(result.ok).toBe(false);
  });
});

describe("superAdminResetHistoryCategory — nothing_to_wipe no-op", () => {
  it("treats nothing_to_wipe as a neutral success for the category", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "nothing_to_wipe" },
    });
    const result = await superAdminResetHistoryCategory(undefined, {
      category: "attendance",
      confirm: "RESET",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nothingToClear).toBe(true);
      expect(result.value.category).toBe("attendance");
    }
  });

  it("still fails on a genuine error token (invalid_category stays red)", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "invalid_category" },
    });
    const result = await superAdminResetHistoryCategory(undefined, {
      category: "attendance",
      confirm: "RESET",
    });
    expect(result.ok).toBe(false);
  });
});
