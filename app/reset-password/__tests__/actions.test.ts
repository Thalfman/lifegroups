import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockRpcSetOwnFullName, mockCookieSet } = vi.hoisted(
  () => ({
    mockCreateClient: vi.fn(),
    mockRpcSetOwnFullName: vi.fn(),
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
  rpcSetOwnFullName: mockRpcSetOwnFullName,
}));

vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { resetPasswordAction } from "../actions";

const AUTH_ID = "33333333-3333-3333-3333-333333333333";

type ProfileRow = {
  full_name: string;
  full_name_pending: boolean;
  email: string;
};

const PENDING_ROW: ProfileRow = {
  full_name: "invitee@example.com", // email placeholder (fresh invite)
  full_name_pending: true,
  email: "invitee@example.com",
};

const CHOSEN_ROW: ProfileRow = {
  ...PENDING_ROW,
  full_name: "Jordan Rivers",
  full_name_pending: false,
};

// Minimal client stub mirroring the chains the action uses: auth.getUser /
// auth.updateUser / auth.signOut and the narrow own-profile read
// (.from("profiles").select(...).eq(...).maybeSingle()).
function makeClient(opts: { profileRow: ProfileRow | null }) {
  const updateUser = vi.fn(async () => ({ data: {}, error: null }));
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: AUTH_ID, email: null } },
      }),
      updateUser,
      signOut: vi.fn(async () => ({ error: null })),
    },
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: opts.profileRow, error: null }),
      };
      return builder;
    },
  };
  return { client, updateUser };
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

const PASSWORD_FIELDS = { password: "longenough", confirm: "longenough" };

beforeEach(() => {
  mockCreateClient.mockReset();
  mockRpcSetOwnFullName.mockReset();
  mockCookieSet.mockReset();
  mockRpcSetOwnFullName.mockResolvedValue({ data: AUTH_ID, error: null });
});

describe("resetPasswordAction — choose-your-name step (ADR 0032)", () => {
  it("saves the chosen name BEFORE the password and completes setup", async () => {
    const { client, updateUser } = makeClient({ profileRow: PENDING_ROW });
    mockCreateClient.mockResolvedValue(client);

    await expect(
      resetPasswordAction(
        {},
        form({ full_name: "  Jordan Rivers  ", ...PASSWORD_FIELDS })
      )
    ).rejects.toThrow("redirect:/login?reset=ok");

    expect(mockRpcSetOwnFullName).toHaveBeenCalledWith(client, {
      p_full_name: "Jordan Rivers",
    });
    expect(updateUser).toHaveBeenCalledWith({ password: "longenough" });
    // Name first: a failed name write must leave the password untouched, so
    // the retry never hits GoTrue's same-password rejection.
    expect(mockRpcSetOwnFullName.mock.invocationCallOrder[0]).toBeLessThan(
      updateUser.mock.invocationCallOrder[0]
    );
  });

  it("returns a field error for an empty name without touching the password", async () => {
    const { client, updateUser } = makeClient({ profileRow: PENDING_ROW });
    mockCreateClient.mockResolvedValue(client);

    const state = await resetPasswordAction(
      {},
      form({ full_name: "   ", ...PASSWORD_FIELDS })
    );

    expect(state).toEqual({ error: "Enter your name." });
    expect(mockRpcSetOwnFullName).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("returns a retryable error when the name RPC fails, password untouched", async () => {
    const { client, updateUser } = makeClient({ profileRow: PENDING_ROW });
    mockCreateClient.mockResolvedValue(client);
    mockRpcSetOwnFullName.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });

    const state = await resetPasswordAction(
      {},
      form({ full_name: "Jordan Rivers", ...PASSWORD_FIELDS })
    );

    expect(state).toEqual({ error: "Couldn't save your name. Try again." });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("treats name_not_pending as a double submit and proceeds to the password", async () => {
    const { client, updateUser } = makeClient({ profileRow: PENDING_ROW });
    mockCreateClient.mockResolvedValue(client);
    mockRpcSetOwnFullName.mockResolvedValue({
      data: null,
      error: { message: "name_not_pending" },
    });

    await expect(
      resetPasswordAction(
        {},
        form({ full_name: "Jordan Rivers", ...PASSWORD_FIELDS })
      )
    ).rejects.toThrow("redirect:/login?reset=ok");

    expect(updateUser).toHaveBeenCalled();
  });

  it("skips the name when the form rendered without the field (degraded read)", async () => {
    // Pending profile, but the POST carries no full_name at all — the page's
    // own name read degraded. Password setup must not block; the /welcome
    // gate collects the name after sign-in.
    const { client, updateUser } = makeClient({ profileRow: PENDING_ROW });
    mockCreateClient.mockResolvedValue(client);

    await expect(
      resetPasswordAction({}, form(PASSWORD_FIELDS))
    ).rejects.toThrow("redirect:/login?reset=ok");

    expect(mockRpcSetOwnFullName).not.toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalled();
  });

  it("never calls the name RPC for a non-pending session (plain reset)", async () => {
    const { client, updateUser } = makeClient({ profileRow: CHOSEN_ROW });
    mockCreateClient.mockResolvedValue(client);

    await expect(
      resetPasswordAction(
        {},
        // Even a stray full_name field is ignored when nothing is pending.
        form({ full_name: "Sneaky Rename", ...PASSWORD_FIELDS })
      )
    ).rejects.toThrow("redirect:/login?reset=ok");

    expect(mockRpcSetOwnFullName).not.toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalled();
  });
});
