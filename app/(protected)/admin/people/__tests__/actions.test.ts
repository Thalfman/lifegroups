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

import {
  adminCreateLeaderProfile,
  adminAssignLeaderToGroup,
  adminAddPersonToGroup,
  adminDeactivateProfile,
} from "../actions";

const ADMIN_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GROUP_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROFILE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const NEW_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({
    ok: true,
    session: { profile: { id: ADMIN_ID, role: "ministry_admin" } },
  });
  mockRpc.mockResolvedValue({ data: NEW_ID, error: null });
  mockCreateClient.mockResolvedValue({ rpc: mockRpc });
});

describe("adminCreateLeaderProfile", () => {
  it("validates, calls the leader-create RPC, and revalidates People", async () => {
    const result = await adminCreateLeaderProfile(undefined, {
      full_name: "Jane Leader",
      email: "jane@example.com",
    });

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("admin_create_leader_profile", {
      p_full_name: "Jane Leader",
      p_email: "jane@example.com",
      p_phone: null,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/people");
  });

  it("rejects an invalid email before the RPC", async () => {
    const result = await adminCreateLeaderProfile(undefined, {
      full_name: "Jane Leader",
      email: "not-an-email",
    });

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("bails closed when the admin gate denies", async () => {
    mockRequireAdminSession.mockResolvedValue({ ok: false, error: "denied" });

    const result = await adminCreateLeaderProfile(undefined, {
      full_name: "Jane Leader",
      email: "jane@example.com",
    });

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("adminAssignLeaderToGroup", () => {
  it("calls the assign RPC and revalidates People, the profile, and the group", async () => {
    const result = await adminAssignLeaderToGroup(undefined, {
      group_id: GROUP_ID,
      profile_id: PROFILE_ID,
      role: "leader",
    });

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("admin_assign_leader_to_group", {
      p_group_id: GROUP_ID,
      p_profile_id: PROFILE_ID,
      p_role: "leader",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/people");
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/people/profile/${PROFILE_ID}`
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/groups/${GROUP_ID}`
    );
  });

  it("refuses to let an admin target themselves (self-guard)", async () => {
    const result = await adminAssignLeaderToGroup(undefined, {
      group_id: GROUP_ID,
      profile_id: ADMIN_ID,
      role: "leader",
    });

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("adminAddPersonToGroup", () => {
  it("creates-and-assigns a member in one RPC and revalidates People + the group", async () => {
    const result = await adminAddPersonToGroup(undefined, {
      group_id: GROUP_ID,
      kind: "member",
      full_name: "Sam Member",
    });

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("admin_add_person_to_group", {
      p_group_id: GROUP_ID,
      p_kind: "member",
      p_full_name: "Sam Member",
      p_email: null,
      p_phone: null,
      p_role: null,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/people");
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/admin/groups/${GROUP_ID}`
    );
  });

  it("creates-and-assigns a leader with the chosen in-group role", async () => {
    const result = await adminAddPersonToGroup(undefined, {
      group_id: GROUP_ID,
      kind: "leader",
      full_name: "Jane Leader",
      email: "jane@example.com",
      role: "co_leader",
    });

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("admin_add_person_to_group", {
      p_group_id: GROUP_ID,
      p_kind: "leader",
      p_full_name: "Jane Leader",
      p_email: "jane@example.com",
      p_phone: null,
      p_role: "co_leader",
    });
  });

  it("rejects a leader with no valid email before the RPC", async () => {
    const result = await adminAddPersonToGroup(undefined, {
      group_id: GROUP_ID,
      kind: "leader",
      full_name: "Jane Leader",
      email: "not-an-email",
      role: "leader",
    } as never);

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind before the RPC", async () => {
    const result = await adminAddPersonToGroup(undefined, {
      group_id: GROUP_ID,
      kind: "ghost",
      full_name: "Sam Member",
    } as never);

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("bails closed when the admin gate denies", async () => {
    mockRequireAdminSession.mockResolvedValue({ ok: false, error: "denied" });

    const result = await adminAddPersonToGroup(undefined, {
      group_id: GROUP_ID,
      kind: "member",
      full_name: "Sam Member",
    });

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("adminDeactivateProfile", () => {
  it("calls the deactivate RPC for a valid, non-self target", async () => {
    const result = await adminDeactivateProfile(undefined, {
      profile_id: PROFILE_ID,
    });

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("admin_deactivate_profile", {
      p_profile_id: PROFILE_ID,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/people");
  });

  it("surfaces a friendly error when the RPC returns no id", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await adminDeactivateProfile(undefined, {
      profile_id: PROFILE_ID,
    });

    expect(result.ok).toBe(false);
  });
});
