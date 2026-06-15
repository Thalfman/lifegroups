import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockInvoke, mockCheckLimit } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockInvoke: vi.fn(),
  mockCheckLimit: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkInviteRedeemLimit: mockCheckLimit,
}));

vi.mock("@/lib/observability/instrument", () => ({
  startActionLog: () => ({ requestId: "test-req", finish: vi.fn() }),
}));

import { redeemInviteAction } from "../actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

const VALID = {
  token: "invite-token",
  full_name: "Jordan Rivers",
  email: "jordan@example.com",
  password: "longenough",
  confirm: "longenough",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckLimit.mockResolvedValue({ configured: false });
  mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
  mockCreateClient.mockResolvedValue({ functions: { invoke: mockInvoke } });
});

describe("redeemInviteAction", () => {
  it("redeems via the edge function and redirects to login on success", async () => {
    await expect(redeemInviteAction({}, form(VALID))).rejects.toThrow(
      "redirect:/login?invited=1"
    );

    expect(mockInvoke).toHaveBeenCalledWith("redeem-invite", {
      body: {
        token: "invite-token",
        full_name: "Jordan Rivers",
        email: "jordan@example.com",
        password: "longenough",
      },
    });
  });

  it("requires the token before validating anything else", async () => {
    const { token: _token, ...withoutToken } = VALID;
    const state = await redeemInviteAction({}, form(withoutToken));

    expect(state.error).toMatch(/token/i);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("rejects an invalid email before the edge call", async () => {
    const state = await redeemInviteAction(
      {},
      form({ ...VALID, email: "nope" })
    );

    expect(state.error).toMatch(/valid email/i);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("rejects a too-short password", async () => {
    const state = await redeemInviteAction(
      {},
      form({ ...VALID, password: "short", confirm: "short" })
    );

    expect(state.error).toMatch(/at least 8/i);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", async () => {
    const state = await redeemInviteAction(
      {},
      form({ ...VALID, confirm: "different" })
    );

    expect(state.error).toMatch(/don't match/i);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("returns the rate-limited copy without calling the edge function", async () => {
    mockCheckLimit.mockResolvedValue({ configured: true, allowed: false });

    const state = await redeemInviteAction({}, form(VALID));

    expect(state.error).toMatch(/too many attempts/i);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("maps a stable edge error code to friendly copy", async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: false, code: "invitation_expired" },
      error: null,
    });

    const state = await redeemInviteAction({}, form(VALID));

    expect(state.error).toMatch(/expired/i);
  });

  it("falls back to generic copy on an unknown edge failure", async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: "network down" },
    });

    const state = await redeemInviteAction({}, form(VALID));

    expect(state.error).toMatch(/couldn't complete your signup/i);
  });
});
