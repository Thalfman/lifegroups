import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression guard for the people-import "did not complete" bug. The RPC returns
// the created COUNT as a `text` scalar; it used to be read through the uuid-only
// channel (callUuidRpc → readUuidRpcData), which rejects any non-uuid string as
// null, so a successful import (e.g. count "3") was always reported as a failure
// even though the rows committed. The action now uses the text channel; these
// tests drive the action with a mocked rpc to prove a count flows through.

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

import { superAdminBulkImportPeople } from "@/app/(protected)/admin/super-admin/people-import-actions";

// A header + one valid leader row (leaders require an email) → exactly one row
// to create, zero per-row errors.
const VALID_CSV =
  "full_name,email,phone,role\nJane Doe,jane@example.com,,leader";

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

describe("superAdminBulkImportPeople — text count return channel", () => {
  it("reports success with the created count (a plain text number, not a uuid)", async () => {
    rpc.mockResolvedValue({ data: "3", error: null });

    const result = await superAdminBulkImportPeople(undefined, {
      payload: VALID_CSV,
    });

    expect(rpc).toHaveBeenCalledWith(
      "super_admin_bulk_import_people",
      expect.objectContaining({ p_rows: expect.any(Array) })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.createdCount).toBe(3);
      expect(result.value.leaderCount).toBe(1);
      expect(result.value.memberCount).toBe(0);
    }
  });

  it("treats a zero count as a success, not a failure", async () => {
    rpc.mockResolvedValue({ data: "0", error: null });

    const result = await superAdminBulkImportPeople(undefined, {
      payload: VALID_CSV,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.createdCount).toBe(0);
  });

  it("still fails on a genuine RPC error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await superAdminBulkImportPeople(undefined, {
      payload: VALID_CSV,
    });

    expect(result.ok).toBe(false);
  });
});
