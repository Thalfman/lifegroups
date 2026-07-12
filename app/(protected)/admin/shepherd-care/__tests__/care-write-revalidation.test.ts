import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdminSession,
  mockRequireOverShepherdOrAdminSession,
  mockCreateClient,
  mockRevalidatePath,
  mockAdminRpc,
  mockWriteRubricGrade,
} = vi.hoisted(() => ({
  mockRequireAdminSession: vi.fn(),
  mockRequireOverShepherdOrAdminSession: vi.fn(),
  mockCreateClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockAdminRpc: vi.fn(),
  mockWriteRubricGrade: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdminSession: mockRequireAdminSession,
  requireOverShepherdOrAdminSession: mockRequireOverShepherdOrAdminSession,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/admin/rpc", () => ({ adminRpc: mockAdminRpc }));

vi.mock("@/lib/admin/write-rubric-grade", () => ({
  writeRubricGrade: mockWriteRubricGrade,
}));

import { adminWriteCareNote } from "../care-notes-actions";
import { adminSetLeaderRubricGrade } from "../leader-grade-actions";

const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROFILE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CREATED_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function expectedCareHosts(profileId: string): string[] {
  return [
    "/admin/care",
    "/admin/shepherd-care",
    `/admin/shepherd-care/${profileId}`,
    `/over-shepherd/${profileId}`,
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  const auth = {
    ok: true,
    session: { profile: { id: ACTOR_ID, role: "ministry_admin" } },
  };
  mockRequireAdminSession.mockResolvedValue(auth);
  mockRequireOverShepherdOrAdminSession.mockResolvedValue(auth);
  mockCreateClient.mockResolvedValue({ rpc: vi.fn() });
  mockAdminRpc.mockResolvedValue({ data: CREATED_ID, error: null });
  mockWriteRubricGrade.mockResolvedValue({ data: CREATED_ID, error: null });
});

describe("shared Care write revalidation", () => {
  it("refreshes every route that hosts a Care Note write", async () => {
    const result = await adminWriteCareNote(undefined, {
      subject_profile_id: PROFILE_ID,
      body: "Please follow up after the next gathering.",
    });

    expect(result).toEqual({ ok: true, value: { id: CREATED_ID } });
    expect(mockRevalidatePath.mock.calls.map(([path]) => path)).toEqual(
      expectedCareHosts(PROFILE_ID)
    );
  });

  it("refreshes both Care aliases and the person detail after a leader grade", async () => {
    const result = await adminSetLeaderRubricGrade(undefined, {
      profile_id: PROFILE_ID,
      ministry_year: 2026,
      criterion_scores: { prayer: 80 },
      override_letter: null,
      override_scope: null,
    });

    expect(result).toEqual({ ok: true, value: { id: CREATED_ID } });
    expect(mockRevalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/admin/care",
      "/admin/shepherd-care",
      `/admin/shepherd-care/${PROFILE_ID}`,
    ]);
  });
});
