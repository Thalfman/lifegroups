import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeSelfServiceAuthenticate } from "@/lib/account/run-action-auth";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

const USER_ID = "44444444-4444-4444-4444-444444444444";

function clientWithUser(user: { id: string } | null) {
  return {
    auth: {
      getUser: async () => ({ data: { user } }),
    },
  };
}

describe("makeSelfServiceAuthenticate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails with supabase_not_configured when no client is available", async () => {
    mockCreateClient.mockResolvedValue(null);
    const onNoSession = vi.fn();
    const authenticate = makeSelfServiceAuthenticate({
      notConfiguredError: "Not configured.",
      onNoSession,
    });

    const result = await authenticate();

    expect(result).toEqual({
      ok: false,
      error: "Not configured.",
      code: "supabase_not_configured",
    });
    expect(onNoSession).not.toHaveBeenCalled();
  });

  it("fails with no_session and fires onNoSession when nobody is signed in", async () => {
    mockCreateClient.mockResolvedValue(clientWithUser(null));
    const onNoSession = vi.fn();
    const captureClient = vi.fn();
    const authenticate = makeSelfServiceAuthenticate({
      notConfiguredError: "Not configured.",
      onNoSession,
      captureClient,
    });

    const result = await authenticate();

    expect(result).toEqual({
      ok: false,
      error: "Sign in to continue.",
      code: "no_session",
    });
    expect(onNoSession).toHaveBeenCalledTimes(1);
    // An unauthenticated caller must never reach the client capture (and by
    // extension the RPC the runner would fire next).
    expect(captureClient).not.toHaveBeenCalled();
  });

  it("returns the actor and captures the client for a signed-in user", async () => {
    const client = clientWithUser({ id: USER_ID });
    mockCreateClient.mockResolvedValue(client);
    const onNoSession = vi.fn();
    const captureClient = vi.fn();
    const authenticate = makeSelfServiceAuthenticate({
      notConfiguredError: "Not configured.",
      onNoSession,
      captureClient,
    });

    const result = await authenticate();

    expect(result).toEqual({
      ok: true,
      actor: { userId: USER_ID },
      baseFields: {},
    });
    expect(captureClient).toHaveBeenCalledWith(client);
    expect(onNoSession).not.toHaveBeenCalled();
  });

  it("works without the optional callbacks", async () => {
    mockCreateClient.mockResolvedValue(clientWithUser({ id: USER_ID }));
    const authenticate = makeSelfServiceAuthenticate({
      notConfiguredError: "Not configured.",
    });

    await expect(authenticate()).resolves.toEqual({
      ok: true,
      actor: { userId: USER_ID },
      baseFields: {},
    });
  });
});
