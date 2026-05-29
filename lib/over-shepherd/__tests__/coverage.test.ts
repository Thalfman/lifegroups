import { describe, expect, it, vi } from "vitest";
import {
  fetchOverShepherdCoverageForCaller,
} from "@/lib/over-shepherd/coverage";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const OS_ID = "11111111-1111-1111-1111-111111111111";
const SHEP_1 = "22222222-2222-2222-2222-222222222222";
const SHEP_2 = "33333333-3333-3333-3333-333333333333";

// Minimal client exposing only the rpc() seam the helper uses. The
// email-collision policy (single active match) and the active-only coverage
// filter are enforced in the SECURITY DEFINER SQL function
// over_shepherd_caller_coverage(); here we pin how the read layer maps each
// shape that function can return.
function clientReturning(result: { data: unknown; error: unknown }): AppSupabaseClient {
  return {
    rpc: vi.fn(async () => result),
  } as unknown as AppSupabaseClient;
}

describe("fetchOverShepherdCoverageForCaller", () => {
  it("resolves identity + actively-covered shepherd ids on a single match", async () => {
    const client = clientReturning({
      data: {
        over_shepherd_id: OS_ID,
        // SQL returns only active-coverage shepherd ids; ended/inactive
        // assignments are already filtered out before this point.
        covered_shepherd_ids: [SHEP_1, SHEP_2],
      },
      error: null,
    });
    const r = await fetchOverShepherdCoverageForCaller(client);
    expect(r.error).toBeNull();
    expect(r.data).toEqual({
      overShepherdId: OS_ID,
      coveredShepherdIds: [SHEP_1, SHEP_2],
    });
  });

  it("resolves an empty coverage set (active roster row, no active coverage)", async () => {
    const client = clientReturning({
      data: { over_shepherd_id: OS_ID, covered_shepherd_ids: [] },
      error: null,
    });
    const r = await fetchOverShepherdCoverageForCaller(client);
    expect(r.error).toBeNull();
    expect(r.data).toEqual({ overShepherdId: OS_ID, coveredShepherdIds: [] });
  });

  it("treats a NULL result (no match / ambiguous match) as no-access, not an error", async () => {
    const client = clientReturning({ data: null, error: null });
    const r = await fetchOverShepherdCoverageForCaller(client);
    expect(r.error).toBeNull();
    expect(r.data).toBeNull();
  });

  it("surfaces a backend error as an error (distinct from no-access)", async () => {
    const client = clientReturning({
      data: null,
      error: { message: "transient" },
    });
    const r = await fetchOverShepherdCoverageForCaller(client);
    expect(r.data).toBeNull();
    expect(r.error).toBeInstanceOf(Error);
    expect(r.error?.message).toMatch(/transient/);
  });

  it("rejects a malformed payload (non-uuid id) as an error", async () => {
    const client = clientReturning({
      data: { over_shepherd_id: "not-a-uuid", covered_shepherd_ids: [] },
      error: null,
    });
    const r = await fetchOverShepherdCoverageForCaller(client);
    expect(r.data).toBeNull();
    expect(r.error).toBeInstanceOf(Error);
    expect(r.error?.message).toMatch(/shape validation/);
  });

  it("rejects a coverage id that isn't a uuid", async () => {
    const client = clientReturning({
      data: { over_shepherd_id: OS_ID, covered_shepherd_ids: [SHEP_1, "nope"] },
      error: null,
    });
    const r = await fetchOverShepherdCoverageForCaller(client);
    expect(r.error).toBeInstanceOf(Error);
  });

  it("returns an error when the client is not configured", async () => {
    const r = await fetchOverShepherdCoverageForCaller(null);
    expect(r.data).toBeNull();
    expect(r.error).toBeInstanceOf(Error);
  });
});
