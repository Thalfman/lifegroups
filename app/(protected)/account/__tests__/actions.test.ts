import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockRpcRequestDeletion, mockCookieSet } = vi.hoisted(
  () => ({
    mockCreateClient: vi.fn(),
    mockRpcRequestDeletion: vi.fn(),
    mockCookieSet: vi.fn(),
  })
);

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mockCookieSet }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("@/lib/account/rpc", () => ({
  rpcRequestOwnAccountDeletion: mockRpcRequestDeletion,
}));

vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { requestAccountDeletionAction } from "../actions";

const AUTH_ID = "33333333-3333-3333-3333-333333333333";
const REQUEST_ID = "44444444-4444-4444-4444-444444444444";

function makeClient() {
  const signOut = vi.fn(async () => ({ error: null }));
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: AUTH_ID, email: null } } }),
      signOut,
    },
  };
  return { client, signOut };
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

beforeEach(() => {
  mockCreateClient.mockReset();
  mockRpcRequestDeletion.mockReset();
  mockCookieSet.mockReset();
  mockRpcRequestDeletion.mockResolvedValue({ data: REQUEST_ID, error: null });
});

describe("requestAccountDeletionAction (#563)", () => {
  it("archives, records, signs out, and redirects on success", async () => {
    const { client, signOut } = makeClient();
    mockCreateClient.mockResolvedValue(client);

    await expect(
      requestAccountDeletionAction(
        {},
        form({ confirm: "on", reason: "  moving away  " })
      )
    ).rejects.toThrow("redirect:/account-deletion?status=requested");

    expect(mockRpcRequestDeletion).toHaveBeenCalledWith(client, {
      p_reason: "moving away",
    });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mockCookieSet).toHaveBeenCalled();
  });

  it("passes a null reason when none is given", async () => {
    const { client } = makeClient();
    mockCreateClient.mockResolvedValue(client);

    await expect(
      requestAccountDeletionAction({}, form({ confirm: "on" }))
    ).rejects.toThrow("redirect:/account-deletion?status=requested");

    expect(mockRpcRequestDeletion).toHaveBeenCalledWith(client, {
      p_reason: null,
    });
  });

  it("requires the confirmation checkbox before doing anything", async () => {
    const { client, signOut } = makeClient();
    mockCreateClient.mockResolvedValue(client);

    const state = await requestAccountDeletionAction({}, form({ reason: "x" }));

    expect(state.error).toMatch(/confirm/i);
    expect(mockRpcRequestDeletion).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("rejects an over-long reason without calling the RPC", async () => {
    const { client } = makeClient();
    mockCreateClient.mockResolvedValue(client);

    const state = await requestAccountDeletionAction(
      {},
      form({ confirm: "on", reason: "z".repeat(1001) })
    );

    expect(state.error).toMatch(/too long/i);
    expect(mockRpcRequestDeletion).not.toHaveBeenCalled();
  });

  it("surfaces a friendly error and does not sign out a super admin", async () => {
    const { client, signOut } = makeClient();
    mockCreateClient.mockResolvedValue(client);
    mockRpcRequestDeletion.mockResolvedValue({
      data: null,
      error: { message: "forbidden_target" },
    });

    const state = await requestAccountDeletionAction(
      {},
      form({ confirm: "on" })
    );

    expect(state.error).toMatch(/danger zone/i);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("treats an existing pending request as done — signs out and confirms", async () => {
    const { client, signOut } = makeClient();
    mockCreateClient.mockResolvedValue(client);
    mockRpcRequestDeletion.mockResolvedValue({
      data: null,
      error: { message: "deletion_already_requested" },
    });

    await expect(
      requestAccountDeletionAction({}, form({ confirm: "on" }))
    ).rejects.toThrow("redirect:/account-deletion?status=requested");

    expect(signOut).toHaveBeenCalled();
  });

  it("returns a retryable error on an unexpected RPC failure", async () => {
    const { client, signOut } = makeClient();
    mockCreateClient.mockResolvedValue(client);
    mockRpcRequestDeletion.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });

    const state = await requestAccountDeletionAction(
      {},
      form({ confirm: "on" })
    );

    expect(state.error).toMatch(/try again/i);
    expect(signOut).not.toHaveBeenCalled();
  });
});
