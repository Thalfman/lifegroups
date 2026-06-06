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

import {
  leaderWriteGroupCareNote,
  leaderWriteGroupPrayerRequest,
} from "@/app/(protected)/leader/[groupId]/care/actions";

const PROFILE_ID = "11111111-1111-1111-1111-111111111111";
const GROUP_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_GROUP = "33333333-3333-3333-3333-333333333333";
const NEW_ID = "44444444-4444-4444-4444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireLeaderActor.mockResolvedValue({
    ok: true,
    profileId: PROFILE_ID,
    assignedGroupIds: [GROUP_ID],
  });
  mockRpc.mockResolvedValue({ data: NEW_ID, error: null });
  mockCreateClient.mockResolvedValue({ rpc: mockRpc });
});

describe("leaderWriteGroupCareNote", () => {
  it("writes the note and calls the group-care-note RPC with the group + body", async () => {
    const result = await leaderWriteGroupCareNote(undefined, {
      group_id: GROUP_ID,
      body: "Group is in a tender season.",
    });

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("leader_write_group_care_note", {
      p_group_id: GROUP_ID,
      p_body: "Group is in a tender season.",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/leader/${GROUP_ID}/care`);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/leader");
  });

  it("refuses to write to a group the leader is not assigned to (no RPC call)", async () => {
    const result = await leaderWriteGroupCareNote(undefined, {
      group_id: OTHER_GROUP,
      body: "should not be written",
    });

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("fails validation on an empty body without calling the RPC", async () => {
    const result = await leaderWriteGroupCareNote(undefined, {
      group_id: GROUP_ID,
      body: "   ",
    });

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("leaderWriteGroupPrayerRequest", () => {
  it("calls the group-prayer-request RPC with the group + body", async () => {
    const result = await leaderWriteGroupPrayerRequest(undefined, {
      group_id: GROUP_ID,
      body: "Pray for our launch night.",
    });

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("leader_write_group_prayer_request", {
      p_group_id: GROUP_ID,
      p_body: "Pray for our launch night.",
    });
  });
});
