import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  adminSetOverShepherdActive,
  adminUpdateOverShepherd,
} from "@/app/(protected)/admin/shepherd-care/over-shepherd-actions";

const ACTOR = "11111111-1111-1111-1111-111111111111";
const OS_ID = "22222222-2222-2222-2222-222222222222";

// The dynamic leader-detail route, invalidated wholesale (we don't know the
// freed leader ids) via revalidatePath(path, "page").
const LEADER_DETAIL_ROUTE = "/admin/shepherd-care/[profileId]";

let rpc: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  rpc = vi.fn(async () => ({ data: OS_ID, error: null }));
  mockRequireAdminSession.mockResolvedValue({
    ok: true,
    session: { profile: { id: ACTOR, role: "ministry_admin" } },
  });
  mockCreateClient.mockResolvedValue({ rpc });
});

// #423 / PR #428 review: archiving an over-shepherd ends coverage for every
// leader it covered, so those leaders' detail pages must be revalidated. The
// archive actions invalidate the whole [profileId] route — but ONLY when
// archiving (active -> false), not on restore or a plain edit.
describe("over-shepherd archive revalidates leader detail pages", () => {
  it("set-active revalidates the leader-detail route on archive", async () => {
    const result = await adminSetOverShepherdActive(undefined, {
      over_shepherd_id: OS_ID,
      active: false,
    });

    expect(result.ok).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      LEADER_DETAIL_ROUTE,
      "page"
    );
  });

  it("set-active does NOT revalidate leader pages on restore", async () => {
    const result = await adminSetOverShepherdActive(undefined, {
      over_shepherd_id: OS_ID,
      active: true,
    });

    expect(result.ok).toBe(true);
    expect(mockRevalidatePath).not.toHaveBeenCalledWith(
      LEADER_DETAIL_ROUTE,
      "page"
    );
  });

  it("edit-form update revalidates leader pages when it archives", async () => {
    const result = await adminUpdateOverShepherd(undefined, {
      over_shepherd_id: OS_ID,
      full_name: "Pat Coach",
      email: "",
      phone: "",
      notes: "",
      active: false,
    });

    expect(result.ok).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      LEADER_DETAIL_ROUTE,
      "page"
    );
  });

  it("edit-form update does NOT revalidate leader pages on a plain edit", async () => {
    const result = await adminUpdateOverShepherd(undefined, {
      over_shepherd_id: OS_ID,
      full_name: "Pat Coach",
      email: "",
      phone: "",
      notes: "",
      active: true,
    });

    expect(result.ok).toBe(true);
    expect(mockRevalidatePath).not.toHaveBeenCalledWith(
      LEADER_DETAIL_ROUTE,
      "page"
    );
  });
});
