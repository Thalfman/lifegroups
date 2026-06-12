import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireLeaderActor,
  mockCreateClient,
  mockRevalidatePath,
  mockRpc,
} = vi.hoisted(() => ({
  mockRequireLeaderActor: vi.fn(),
  mockCreateClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireLeaderActor: mockRequireLeaderActor,
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

import { leaderUpdateFollowUpStatus } from "@/app/(protected)/leader/follow-up-actions";

const PROFILE_ID = "11111111-1111-1111-1111-111111111111";
const GROUP_ID = "22222222-2222-2222-2222-222222222222";
const FOLLOW_UP_ID = "33333333-3333-3333-3333-333333333333";
const UPDATED_ID = "44444444-4444-4444-4444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireLeaderActor.mockResolvedValue({
    ok: true,
    profileId: PROFILE_ID,
    assignedGroupIds: [GROUP_ID],
  });
  mockRpc.mockResolvedValue({ data: UPDATED_ID, error: null });
  mockCreateClient.mockResolvedValue({ rpc: mockRpc });
});

describe("leaderUpdateFollowUpStatus", () => {
  it("uses the shared leader guard and calls the status RPC", async () => {
    const result = await leaderUpdateFollowUpStatus(undefined, {
      follow_up_id: FOLLOW_UP_ID,
      status: "in_progress",
    });

    expect(result).toEqual({ ok: true, value: { id: UPDATED_ID } });
    expect(mockRequireLeaderActor).toHaveBeenCalledOnce();
    expect(mockRpc).toHaveBeenCalledWith("leader_update_follow_up_status", {
      p_follow_up_id: FOLLOW_UP_ID,
      p_status: "in_progress",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/leader");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/follow-ups");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("rejects invalid status values before the RPC", async () => {
    const formData = new FormData();
    formData.set("follow_up_id", FOLLOW_UP_ID);
    formData.set("status", "open");

    const result = await leaderUpdateFollowUpStatus(undefined, formData);

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
