import { beforeEach, describe, expect, it, vi } from "vitest";

// Guards for the admin-gated bulk people importer (Settings > System). Two
// things matter: (1) the RPC returns the created COUNT as a `text` scalar and
// must flow through the text channel — read through the uuid-only channel a
// successful import (e.g. count "3") was wrongly reported as a failure; and
// (2) the action gates on requireAdminSession, so a denied guard surfaces an
// error and never reaches the RPC.

const { mockRequireAdminSession, mockCreateClient, mockRevalidatePath } =
  vi.hoisted(() => ({
    mockRequireAdminSession: vi.fn(),
    mockCreateClient: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }));

vi.mock("@/lib/auth/session", () => ({
  requireAdminSession: mockRequireAdminSession,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

import { adminBulkImportPeople } from "@/app/(protected)/admin/settings/people-import-actions";

// A header + one valid leader row (leaders require an email) → exactly one row
// to create, zero per-row errors.
const VALID_CSV =
  "full_name,email,phone,role\nJane Doe,jane@example.com,,leader";

let rpc: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  rpc = vi.fn();
  mockRequireAdminSession.mockResolvedValue({
    ok: true,
    session: {
      profile: {
        id: "11111111-1111-1111-1111-111111111111",
        role: "ministry_admin",
      },
    },
  });
  mockCreateClient.mockResolvedValue({ rpc });
});

describe("adminBulkImportPeople — text count return channel", () => {
  it("calls the admin-gated RPC and reports success with the created count", async () => {
    rpc.mockResolvedValue({ data: "3", error: null });

    const result = await adminBulkImportPeople(undefined, {
      payload: VALID_CSV,
    });

    expect(rpc).toHaveBeenCalledWith(
      "admin_bulk_import_people",
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

    const result = await adminBulkImportPeople(undefined, {
      payload: VALID_CSV,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.createdCount).toBe(0);
  });

  it("still fails on a genuine RPC error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await adminBulkImportPeople(undefined, {
      payload: VALID_CSV,
    });

    expect(result.ok).toBe(false);
  });
});

describe("adminBulkImportPeople — admin gate", () => {
  it("returns the guard error and never calls the RPC when the session is denied", async () => {
    mockRequireAdminSession.mockResolvedValue({
      ok: false,
      error: "Only ministry admins can perform that action.",
    });

    const result = await adminBulkImportPeople(undefined, {
      payload: VALID_CSV,
    });

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
