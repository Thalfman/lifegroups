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
  adminCreateGroup,
  adminCloseGroup,
  adminReopenGroup,
} from "../actions";

const ADMIN_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GROUP_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
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

describe("adminCreateGroup", () => {
  it("creates a name-only group with the weekly default and refreshes Groups", async () => {
    const result = await adminCreateGroup(
      undefined,
      form({ name: "  New Group  " })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("admin_create_group", {
      p_name: "New Group",
      p_description: null,
      p_meeting_day: null,
      p_meeting_time: null,
      p_location_area: null,
      p_address_optional: null,
      p_capacity: null,
      p_meeting_frequency: "weekly",
      p_meeting_week_parity: null,
      p_group_type: null,
      p_launched_on: null,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/groups");
  });

  it("rejects an empty group name before the RPC", async () => {
    const result = await adminCreateGroup(undefined, form({ name: "" }));

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("adminCloseGroup", () => {
  it("closes a group by id", async () => {
    const result = await adminCloseGroup(
      undefined,
      form({ group_id: GROUP_ID })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("admin_close_group", {
      p_group_id: GROUP_ID,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/groups");
  });

  it("rejects a non-uuid group id", async () => {
    const result = await adminCloseGroup(undefined, form({ group_id: "nope" }));

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("adminReopenGroup", () => {
  it("reopens a group by id", async () => {
    const result = await adminReopenGroup(
      undefined,
      form({ group_id: GROUP_ID })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("admin_reopen_group", {
      p_group_id: GROUP_ID,
    });
  });
});
