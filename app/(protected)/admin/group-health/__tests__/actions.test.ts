import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdminSession,
  mockCreateClient,
  mockRevalidatePath,
  mockRpc,
  mockFetchRubric,
  mockFetchWeeks,
  mockFetchRatings,
} = vi.hoisted(() => ({
  mockRequireAdminSession: vi.fn(),
  mockCreateClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRpc: vi.fn(),
  mockFetchRubric: vi.fn(),
  mockFetchWeeks: vi.fn(),
  mockFetchRatings: vi.fn(),
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

vi.mock("@/lib/admin/group-health-read", () => ({
  fetchGroupHealthRubric: mockFetchRubric,
  fetchGroupAttendanceWeeks: mockFetchWeeks,
  fetchGroupHealthRatings: mockFetchRatings,
}));

import {
  adminRecomputeGroupHealthAssessment,
  adminSetGroupHealthRatings,
} from "../actions";
import { BUILT_IN_GROUP_HEALTH_RUBRIC } from "@/lib/admin/group-health";

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
  mockFetchRubric.mockResolvedValue({
    data: BUILT_IN_GROUP_HEALTH_RUBRIC,
    error: null,
  });
  mockFetchWeeks.mockResolvedValue({ data: [], error: null });
  mockFetchRatings.mockResolvedValue({
    data: { spiritual_growth_score: 4, group_question_score: 3 },
    error: null,
  });
});

// #810 — the revalidate sets are hand-maintained; pin the FULL set per action
// so a dropped path fails a test instead of silently going stale. The admin
// dashboard (/admin) renders the health ratings, so both health-pulse writes
// must refresh it alongside the group-health list and the group detail page.
const EXPECTED_PATHS = [
  "/admin/group-health",
  `/admin/groups/${GROUP_ID}`,
  "/admin",
];

describe("adminRecomputeGroupHealthAssessment revalidation", () => {
  it("revalidates the group-health list, the group detail, and the dashboard", async () => {
    const result = await adminRecomputeGroupHealthAssessment(
      undefined,
      form({ group_id: GROUP_ID })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    for (const path of EXPECTED_PATHS) {
      expect(mockRevalidatePath).toHaveBeenCalledWith(path);
    }
    expect(mockRevalidatePath).toHaveBeenCalledTimes(EXPECTED_PATHS.length);
  });

  it("revalidates nothing when the write is rejected", async () => {
    const result = await adminRecomputeGroupHealthAssessment(
      undefined,
      form({ group_id: "nope" })
    );

    expect(result.ok).toBe(false);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("persists F for a failing composite instead of capping at D (#855)", async () => {
    // No attendance weeks (dimension drops) and rock-bottom 1/5 ratings map to
    // a weighted numeric of 0 — below the d cut-line, so the letter reaching
    // the RPC must be F.
    mockFetchRatings.mockResolvedValue({
      data: { spiritual_growth_score: 1, group_question_score: 1 },
      error: null,
    });

    const result = await adminRecomputeGroupHealthAssessment(
      undefined,
      form({ group_id: GROUP_ID })
    );

    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith(
      "admin_upsert_group_health_assessment",
      expect.objectContaining({
        p_computed_numeric: 0,
        p_computed_letter: "F",
      })
    );
  });
});

describe("adminSetGroupHealthRatings revalidation", () => {
  it("revalidates the group-health list, the group detail, and the dashboard", async () => {
    const result = await adminSetGroupHealthRatings(
      undefined,
      form({
        group_id: GROUP_ID,
        spiritual_growth_score: "4",
        group_question_score: "3",
      })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    for (const path of EXPECTED_PATHS) {
      expect(mockRevalidatePath).toHaveBeenCalledWith(path);
    }
    expect(mockRevalidatePath).toHaveBeenCalledTimes(EXPECTED_PATHS.length);
  });

  it("revalidates nothing when the write is rejected", async () => {
    const result = await adminSetGroupHealthRatings(
      undefined,
      form({ group_id: GROUP_ID })
    );

    expect(result.ok).toBe(false);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
