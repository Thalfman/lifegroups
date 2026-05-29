import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireActor,
  mockCreateClient,
  mockRevalidatePath,
  mockFetchCoverage,
} = vi.hoisted(() => ({
  mockRequireActor: vi.fn(),
  mockCreateClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockFetchCoverage: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireOverShepherdActor: mockRequireActor,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

// Keep the real isCoveredShepherd; only stub the network-bound fetch.
vi.mock("@/lib/over-shepherd/coverage", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/over-shepherd/coverage")>();
  return { ...actual, fetchOverShepherdCoverageForCaller: mockFetchCoverage };
});

vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  runOverShepherdWriteAction,
  type OverShepherdWriteActionSpec,
} from "@/lib/over-shepherd/run-action";

const OS_PROFILE_ID = "11111111-1111-1111-1111-111111111111";
const OS_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const COVERED = "22222222-2222-2222-2222-222222222222";
const UNCOVERED = "99999999-9999-9999-9999-999999999999";
const NEW_ID = "33333333-3333-3333-3333-333333333333";

type Payload = { shepherd_profile_id: string };

function baseSpec(
  overrides: Partial<OverShepherdWriteActionSpec<Payload, { id: string }>> = {},
): OverShepherdWriteActionSpec<Payload, { id: string }> {
  return {
    name: "over_shepherd.test.action",
    read: (input) => (input as Record<string, unknown>) ?? {},
    validate: (raw) =>
      typeof raw.shepherd_profile_id === "string" && raw.shepherd_profile_id.length > 0
        ? { ok: true, value: { shepherd_profile_id: raw.shepherd_profile_id } }
        : { ok: false, errors: ["shepherd_profile_id required"] },
    targetShepherdId: (value) => value.shepherd_profile_id,
    rpc: vi.fn(async () => ({ data: NEW_ID, error: null })),
    revalidate: () => "/over-shepherd",
    noDataError: "nothing saved",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireActor.mockResolvedValue({ ok: true, profileId: OS_PROFILE_ID });
  mockCreateClient.mockResolvedValue({ rpc: vi.fn() });
  mockFetchCoverage.mockResolvedValue({
    data: { overShepherdId: OS_ID, coveredShepherdIds: [COVERED] },
    error: null,
  });
});

describe("runOverShepherdWriteAction", () => {
  it("logs against a covered Shepherd and revalidates", async () => {
    const spec = baseSpec();
    const r = await runOverShepherdWriteAction(spec, undefined, {
      shepherd_profile_id: COVERED,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ id: NEW_ID });
    expect(spec.rpc).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/over-shepherd");
  });

  it("denies a write against an uncovered Shepherd BEFORE the RPC", async () => {
    const spec = baseSpec();
    const r = await runOverShepherdWriteAction(spec, undefined, {
      shepherd_profile_id: UNCOVERED,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/isn't in your care/i);
    // The narrow RPC is never reached when coverage fails the in-app guard.
    expect(spec.rpc).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("denies when the caller has no over-shepherd identity (no-access coverage)", async () => {
    mockFetchCoverage.mockResolvedValueOnce({ data: null, error: null });
    const spec = baseSpec();
    const r = await runOverShepherdWriteAction(spec, undefined, {
      shepherd_profile_id: COVERED,
    });
    expect(r.ok).toBe(false);
    expect(spec.rpc).not.toHaveBeenCalled();
  });

  it("denies when the actor guard rejects (not an over_shepherd)", async () => {
    mockRequireActor.mockResolvedValueOnce({ ok: false, error: "Only an Over-Shepherd can do that." });
    const spec = baseSpec();
    const r = await runOverShepherdWriteAction(spec, undefined, {
      shepherd_profile_id: COVERED,
    });
    expect(r.ok).toBe(false);
    expect(spec.rpc).not.toHaveBeenCalled();
  });

  it("surfaces a transient coverage-lookup failure as a fail (not a denial)", async () => {
    mockFetchCoverage.mockResolvedValueOnce({
      data: null,
      error: new Error("boom"),
    });
    const spec = baseSpec();
    const r = await runOverShepherdWriteAction(spec, undefined, {
      shepherd_profile_id: COVERED,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/temporarily unavailable/i);
    expect(spec.rpc).not.toHaveBeenCalled();
  });

  it("maps an RPC not_covered token to a friendly message", async () => {
    const spec = baseSpec({
      rpc: vi.fn(async () => ({ data: null, error: { message: "not_covered" } })),
    });
    const r = await runOverShepherdWriteAction(spec, undefined, {
      shepherd_profile_id: COVERED,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/isn't in your care/i);
  });
});
