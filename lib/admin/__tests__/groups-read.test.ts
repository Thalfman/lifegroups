import { beforeEach, describe, expect, it, vi } from "vitest";

// The per-request cached groups read (lib/admin/groups-read.ts) is shared by the
// admin dashboard batch (Boundary A) and the Multiply grid (Boundary B) so a
// first /admin launch reads the full groups table once, not once per boundary.
// This pins the passthrough + the no-client fail-safe; the React.cache memo
// (request-scoped dedup) is a property of React's cache, exercised at runtime.
const { mockCreateClient, mockFetchAllGroups } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockFetchAllGroups: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("@/lib/supabase/read-models", () => ({
  fetchAllGroups: mockFetchAllGroups,
}));

import { loadAllGroupsForAdmin } from "@/lib/admin/groups-read";

const FAKE_CLIENT = { from: vi.fn() };
const GROUPS = [{ id: "g1" }, { id: "g2" }];

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateClient.mockResolvedValue(FAKE_CLIENT);
  mockFetchAllGroups.mockResolvedValue({ data: GROUPS, error: null });
});

describe("loadAllGroupsForAdmin", () => {
  it("returns fetchAllGroups's result for the request client", async () => {
    const result = await loadAllGroupsForAdmin();
    expect(result).toEqual({ data: GROUPS, error: null });
    expect(mockFetchAllGroups).toHaveBeenCalledWith(FAKE_CLIENT);
  });

  it("passes a read error straight through (degrades at the call site)", async () => {
    const error = { message: "groups read failed" };
    mockFetchAllGroups.mockResolvedValue({ data: null, error });
    expect(await loadAllGroupsForAdmin()).toEqual({ data: null, error });
  });

  it("fails safe to an empty list when no client is configured", async () => {
    mockCreateClient.mockResolvedValue(null);
    expect(await loadAllGroupsForAdmin()).toEqual({ data: [], error: null });
    // No client ⇒ the underlying read is never reached.
    expect(mockFetchAllGroups).not.toHaveBeenCalled();
  });
});
