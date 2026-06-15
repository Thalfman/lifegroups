import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockRevalidatePath, mockSetOwnFullName } = vi.hoisted(
  () => ({
    mockCreateClient: vi.fn(),
    mockRevalidatePath: vi.fn(),
    mockSetOwnFullName: vi.fn(),
  })
);

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("@/lib/account/rpc", () => ({
  rpcSetOwnFullName: mockSetOwnFullName,
}));

vi.mock("@/lib/observability/instrument", () => ({
  startActionLog: () => ({ requestId: "test-req", finish: vi.fn() }),
}));

import { chooseNameAction } from "../actions";

const AUTH_ID = "66666666-6666-6666-6666-666666666666";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

function makeClient(user: { id: string } | null = { id: AUTH_ID }) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSetOwnFullName.mockResolvedValue({ data: AUTH_ID, error: null });
  mockCreateClient.mockResolvedValue(makeClient());
});

describe("chooseNameAction", () => {
  it("saves the trimmed name, revalidates the shell, and redirects home", async () => {
    await expect(
      chooseNameAction({}, form({ full_name: "  Jordan Rivers  " }))
    ).rejects.toThrow("redirect:/");

    expect(mockSetOwnFullName).toHaveBeenCalledWith(expect.anything(), {
      p_full_name: "Jordan Rivers",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects an empty name without calling the RPC", async () => {
    const state = await chooseNameAction({}, form({ full_name: "   " }));

    expect(state.error).toBeTruthy();
    expect(mockSetOwnFullName).not.toHaveBeenCalled();
  });

  it("treats name_not_pending as already done and still completes", async () => {
    mockSetOwnFullName.mockResolvedValue({
      data: null,
      error: { message: "name_not_pending" },
    });

    await expect(
      chooseNameAction({}, form({ full_name: "Jordan Rivers" }))
    ).rejects.toThrow("redirect:/");

    expect(mockRevalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("returns a generic error when the name RPC fails", async () => {
    mockSetOwnFullName.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });

    const state = await chooseNameAction(
      {},
      form({ full_name: "Jordan Rivers" })
    );

    expect(state.error).toMatch(/try again/i);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
