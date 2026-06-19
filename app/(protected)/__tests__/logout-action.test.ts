import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockCookieSet, mockGetSession } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCookieSet: vi.fn(),
  mockGetSession: vi.fn(),
}));

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

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: mockGetSession,
}));

vi.mock("@/lib/observability/instrument", () => ({
  startActionLog: () => ({ finish: vi.fn() }),
}));

import { logoutAction } from "../actions";

beforeEach(() => {
  mockCreateClient.mockReset();
  mockCookieSet.mockReset();
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({
    kind: "authenticated",
    profile: { role: "super_admin" },
  });
});

describe("logoutAction", () => {
  it("signs out locally and clears both the setup-gate and landing-hint cookies", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    mockCreateClient.mockResolvedValue({ auth: { signOut } });

    await expect(logoutAction()).rejects.toThrow("redirect:/login");

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    // Landing-path hint is cleared (maxAge 0) so the next sign-in re-resolves it.
    expect(mockCookieSet).toHaveBeenCalledWith(
      "lg_landing_path",
      "",
      expect.objectContaining({ maxAge: 0 })
    );
  });
});
