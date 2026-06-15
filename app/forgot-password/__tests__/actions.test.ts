import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockResetPasswordForEmail, mockCheckLimit } =
  vi.hoisted(() => ({
    mockCreateClient: vi.fn(),
    mockResetPasswordForEmail: vi.fn(),
    mockCheckLimit: vi.fn(),
  }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkForgotPasswordLimit: mockCheckLimit,
}));

vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { forgotPasswordAction } from "../actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

function makeClient() {
  return {
    auth: { resetPasswordForEmail: mockResetPasswordForEmail },
  };
}

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  // Limiter unconfigured by default -> the request proceeds.
  mockCheckLimit.mockResolvedValue({ configured: false });
  mockResetPasswordForEmail.mockResolvedValue({ error: null });
  mockCreateClient.mockResolvedValue(makeClient());
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
});

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
});

describe("forgotPasswordAction", () => {
  it("rejects an invalid email before doing anything", async () => {
    const state = await forgotPasswordAction(
      {},
      form({ email: "not-an-email" })
    );

    expect(state.error).toMatch(/valid email/i);
    expect(state.submitted).toBeUndefined();
    expect(mockCheckLimit).not.toHaveBeenCalled();
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("sends the reset email and returns the generic submitted state", async () => {
    const state = await forgotPasswordAction(
      {},
      form({ email: "  Person@Example.com  " })
    );

    expect(state).toEqual({ submitted: true });
    // Email is normalized (trimmed + lowercased) and the redirect targets the
    // reset-password route on the configured site URL.
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      "person@example.com",
      {
        redirectTo: "https://app.example.com/reset-password",
      }
    );
  });

  it("returns the same submitted state when throttled, without sending", async () => {
    mockCheckLimit.mockResolvedValue({
      configured: true,
      allowed: false,
      which: "email",
    });

    const state = await forgotPasswordAction(
      {},
      form({ email: "person@example.com" })
    );

    // No enumeration oracle: a throttled request looks identical to success.
    expect(state).toEqual({ submitted: true });
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("still reports submitted when Supabase is not configured", async () => {
    mockCreateClient.mockResolvedValue(null);

    const state = await forgotPasswordAction(
      {},
      form({ email: "person@example.com" })
    );

    expect(state).toEqual({ submitted: true });
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("swallows a GoTrue send failure and still reports submitted", async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", message: "slow down" },
    });

    const state = await forgotPasswordAction(
      {},
      form({ email: "person@example.com" })
    );

    expect(state).toEqual({ submitted: true });
    expect(mockResetPasswordForEmail).toHaveBeenCalledOnce();
  });
});
