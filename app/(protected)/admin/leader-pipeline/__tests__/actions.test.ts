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
  adminAdvanceApprenticeStage,
  adminArchiveApprentice,
  adminCreateApprentice,
  adminUpdateApprentice,
} from "../actions";

const ADMIN_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GROUP_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const APPRENTICE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
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

// #810 — the shared APPRENTICE_REVALIDATE set is hand-maintained; pin the FULL
// set so a dropped path fails a test instead of silently going stale. The
// admin dashboard (/admin) renders the pipeline card, so every apprentice
// write must refresh it alongside the pipeline's other host surfaces.
const EXPECTED_PATHS = [
  "/admin/leader-pipeline",
  "/admin/launch-planning",
  "/admin/people",
  "/admin/multiply",
  "/admin",
];

function expectFullPathSet() {
  for (const path of EXPECTED_PATHS) {
    expect(mockRevalidatePath).toHaveBeenCalledWith(path);
  }
  expect(mockRevalidatePath).toHaveBeenCalledTimes(EXPECTED_PATHS.length);
}

describe("apprentice action revalidation", () => {
  it("adminCreateApprentice revalidates every pipeline host surface", async () => {
    const result = await adminCreateApprentice(
      undefined,
      form({ group_id: GROUP_ID, display_name: "Sam Rivera" })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expectFullPathSet();
  });

  it("adminUpdateApprentice revalidates every pipeline host surface", async () => {
    const result = await adminUpdateApprentice(
      undefined,
      form({ apprentice_id: APPRENTICE_ID, display_name: "Sam Rivera" })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expectFullPathSet();
  });

  it("adminAdvanceApprenticeStage revalidates every pipeline host surface", async () => {
    const result = await adminAdvanceApprenticeStage(
      undefined,
      form({ apprentice_id: APPRENTICE_ID, readiness_stage: "in_training" })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expectFullPathSet();
  });

  it("adminArchiveApprentice revalidates every pipeline host surface", async () => {
    const result = await adminArchiveApprentice(
      undefined,
      form({ apprentice_id: APPRENTICE_ID })
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expectFullPathSet();
  });

  it("revalidates nothing when the write is rejected", async () => {
    const result = await adminAdvanceApprenticeStage(
      undefined,
      form({ apprentice_id: "nope", readiness_stage: "in_training" })
    );

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
