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
  adminCreateProspect,
  adminTransitionProspect,
  adminArchiveProspect,
} from "../actions";

const ADMIN_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROSPECT_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const GROUP_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const NEW_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

// The Interest Funnel write actions all refresh the same three surfaces.
const FUNNEL_PATHS = ["/admin/plan", "/admin", "/admin/multiply"];

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

describe("adminCreateProspect", () => {
  it("creates a prospect with a null desired cell and refreshes the funnel", async () => {
    const result = await adminCreateProspect(
      undefined,
      form({ full_name: "  Pat Prospect  " })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("admin_create_prospect", {
      p_full_name: "Pat Prospect",
      p_email: null,
      p_phone: null,
      p_desired_audience_category: null,
      p_desired_category_id: null,
    });
    for (const path of FUNNEL_PATHS) {
      expect(mockRevalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("rejects a blank name before the RPC", async () => {
    const result = await adminCreateProspect(
      undefined,
      form({ full_name: "   " })
    );

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("adminTransitionProspect", () => {
  it("calls the transition RPC with the chosen state and group", async () => {
    const result = await adminTransitionProspect(
      undefined,
      form({ prospect_id: PROSPECT_ID, state: "matched", group_id: GROUP_ID })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("admin_transition_prospect", {
      p_prospect_id: PROSPECT_ID,
      p_state: "matched",
      p_group_id: GROUP_ID,
    });
  });

  it("rejects an unknown funnel state", async () => {
    const result = await adminTransitionProspect(
      undefined,
      form({ prospect_id: PROSPECT_ID, state: "graduated", group_id: GROUP_ID })
    );

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("adminArchiveProspect", () => {
  it("archives a prospect by id", async () => {
    const result = await adminArchiveProspect(
      undefined,
      form({ prospect_id: PROSPECT_ID })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRpc).toHaveBeenCalledWith("admin_archive_prospect", {
      p_prospect_id: PROSPECT_ID,
    });
  });

  it("rejects a non-uuid prospect id", async () => {
    const result = await adminArchiveProspect(
      undefined,
      form({ prospect_id: "nope" })
    );

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
