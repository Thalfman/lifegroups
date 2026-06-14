import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockRpcMarkSeen } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockRpcMarkSeen: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("@/lib/account/rpc", () => ({
  rpcMarkFirstRunOrientationSeen: mockRpcMarkSeen,
}));

vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { markFirstRunOrientationSeenAction } from "../orientation-actions";

const AUTH_ID = "33333333-3333-3333-3333-333333333333";

function makeClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: AUTH_ID, email: null } } }),
    },
  };
}

beforeEach(() => {
  mockCreateClient.mockReset();
  mockRpcMarkSeen.mockReset();
  mockRpcMarkSeen.mockResolvedValue({ data: AUTH_ID, error: null });
});

describe("markFirstRunOrientationSeenAction (#560)", () => {
  it("returns ok on success", async () => {
    const client = makeClient();
    mockCreateClient.mockResolvedValue(client);

    expect(await markFirstRunOrientationSeenAction()).toEqual({ ok: true });
    expect(mockRpcMarkSeen).toHaveBeenCalledWith(client);
  });

  it("returns ok:false when Supabase isn't configured", async () => {
    mockCreateClient.mockResolvedValue(null);
    expect(await markFirstRunOrientationSeenAction()).toEqual({ ok: false });
    expect(mockRpcMarkSeen).not.toHaveBeenCalled();
  });

  it("returns ok:false when there is no session", async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    });
    expect(await markFirstRunOrientationSeenAction()).toEqual({ ok: false });
    expect(mockRpcMarkSeen).not.toHaveBeenCalled();
  });

  it("returns ok:false when the RPC fails", async () => {
    mockCreateClient.mockResolvedValue(makeClient());
    mockRpcMarkSeen.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    expect(await markFirstRunOrientationSeenAction()).toEqual({ ok: false });
  });
});
