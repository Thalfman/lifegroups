import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdminSession,
  mockCreateClient,
  mockRevalidatePath,
  mockWriteRubricGrade,
} = vi.hoisted(() => ({
  mockRequireAdminSession: vi.fn(),
  mockCreateClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockWriteRubricGrade: vi.fn(),
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

vi.mock("@/lib/admin/write-rubric-grade", () => ({
  writeRubricGrade: mockWriteRubricGrade,
}));

import { adminSetGroupRubricGrade } from "../grade-actions";

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
  mockWriteRubricGrade.mockResolvedValue({ data: NEW_ID, error: null });
  mockCreateClient.mockResolvedValue({ rpc: vi.fn() });
});

// #810 — the revalidate set is hand-maintained; pin the FULL set so a dropped
// path fails a test instead of silently going stale. The grade-entry form is
// mounted on the shepherd-care detail page seeded from server-loaded
// initialScores, and the payload carries only group_id (no profile id), so the
// detail pages must be invalidated via the wildcard page target — otherwise a
// re-edit from stale initialScores can overwrite the just-saved grade.
describe("adminSetGroupRubricGrade revalidation", () => {
  it("revalidates care, the shepherd-care list, and every detail page", async () => {
    const result = await adminSetGroupRubricGrade(
      undefined,
      form({
        group_id: GROUP_ID,
        ministry_year: "2026",
        criterion_scores: JSON.stringify({ prayer: 80 }),
      })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/care");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/shepherd-care");
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      "/admin/shepherd-care/[profileId]",
      "page"
    );
    expect(mockRevalidatePath).toHaveBeenCalledTimes(3);
  });

  it("revalidates nothing when the write is rejected", async () => {
    const result = await adminSetGroupRubricGrade(
      undefined,
      form({ group_id: "nope", ministry_year: "2026", criterion_scores: "{}" })
    );

    expect(result.ok).toBe(false);
    expect(mockWriteRubricGrade).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
