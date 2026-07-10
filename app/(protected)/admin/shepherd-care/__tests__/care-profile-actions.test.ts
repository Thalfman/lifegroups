import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdminSession,
  mockCreateClient,
  mockRevalidatePath,
  mockRpc,
} = vi.hoisted(() => ({
  mockRequireAdminSession: vi.fn(),
  mockCreateClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdminSession: mockRequireAdminSession,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { adminUpsertShepherdCareProfile } from "../care-profile-actions";

const ADMIN_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SHEPHERD_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const NEW_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({
    ok: true,
    session: { profile: { id: ADMIN_ID, role: "ministry_admin" } },
  });
  mockRpc.mockResolvedValue({ data: NEW_ID, error: null });
  mockCreateClient.mockResolvedValue({ rpc: mockRpc });
});

describe("adminUpsertShepherdCareProfile", () => {
  it("upserts the admin summary and revalidates the care surface + detail", async () => {
    const result = await adminUpsertShepherdCareProfile(
      undefined,
      form({
        shepherd_profile_id: SHEPHERD_ID,
        set_admin_summary: "true",
        admin_summary: "Checking in next week",
      })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("admin_upsert_shepherd_care_profile", {
      p_shepherd_profile_id: SHEPHERD_ID,
      p_current_status: "doing_well",
      p_set_current_status: false,
      p_next_touchpoint_due: null,
      p_set_next_touchpoint_due: false,
      p_admin_summary: "Checking in next week",
      p_set_admin_summary: true,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/shepherd-care");
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/shepherd-care/${SHEPHERD_ID}`
    );
  });

  it("rejects an upsert that changes no field", async () => {
    const result = await adminUpsertShepherdCareProfile(
      undefined,
      form({ shepherd_profile_id: SHEPHERD_ID })
    );

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid shepherd profile id", async () => {
    const result = await adminUpsertShepherdCareProfile(
      undefined,
      form({
        shepherd_profile_id: "nope",
        set_admin_summary: "true",
        admin_summary: "hi",
      })
    );

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
