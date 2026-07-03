import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSuperAdminSession,
  mockCreateClient,
  mockRevalidatePath,
  mockResolveSiteOrigin,
  mockRpc,
  mockResetPasswordForEmail,
  mockLog,
} = vi.hoisted(() => ({
  mockRequireSuperAdminSession: vi.fn(),
  mockCreateClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockResolveSiteOrigin: vi.fn(),
  mockRpc: vi.fn(),
  mockResetPasswordForEmail: vi.fn(),
  mockLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSuperAdminSession: mockRequireSuperAdminSession,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/shared/site-origin", () => ({
  resolveSiteOrigin: mockResolveSiteOrigin,
}));

vi.mock("@/lib/observability/logger", () => ({
  log: mockLog,
}));

import { superAdminRequestPasswordReset } from "../account-actions";

const PROFILE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const EMAIL = "shepherd@example.test";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSuperAdminSession.mockResolvedValue({
    ok: true,
    session: { profile: { id: PROFILE_ID, role: "super_admin" } },
  });
  mockResolveSiteOrigin.mockResolvedValue("https://example.test");
  mockResetPasswordForEmail.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: PROFILE_ID, error: null });
  mockCreateClient.mockResolvedValue({
    rpc: mockRpc,
    auth: { resetPasswordForEmail: mockResetPasswordForEmail },
  });
});

describe("superAdminRequestPasswordReset", () => {
  it("sends the reset email and logs the audit RPC with the lowercased id", async () => {
    const result = await superAdminRequestPasswordReset(
      undefined,
      form({ email: EMAIL, profile_id: PROFILE_ID.toUpperCase() })
    );

    expect(result).toEqual({ ok: true, value: { email: EMAIL } });
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(EMAIL, {
      redirectTo: "https://example.test/reset-password",
    });
    expect(mockRpc).toHaveBeenCalledWith("super_admin_log_password_reset", {
      p_profile_id: PROFILE_ID,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/super-admin");
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "super_admin.request_password_reset",
        outcome: "ok",
        target_profile_id: PROFILE_ID,
      })
    );
  });

  it("rejects a non-uuid profile_id before any email goes out", async () => {
    const result = await superAdminRequestPasswordReset(
      undefined,
      form({ email: EMAIL, profile_id: "not-a-uuid" })
    );

    expect(result.ok).toBe(false);
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects a missing profile_id before any email goes out", async () => {
    const result = await superAdminRequestPasswordReset(
      undefined,
      form({ email: EMAIL })
    );

    expect(result.ok).toBe(false);
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects a missing email before the RPC", async () => {
    const result = await superAdminRequestPasswordReset(
      undefined,
      form({ profile_id: PROFILE_ID })
    );

    expect(result.ok).toBe(false);
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // Best-effort audit: the email already went out, so the operator still sees
  // success — but the missing audit row must land in the log drain as a fail.
  it("stays ok for the operator but logs a fail when the audit RPC errors", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await superAdminRequestPasswordReset(
      undefined,
      form({ email: EMAIL, profile_id: PROFILE_ID })
    );

    expect(result).toEqual({ ok: true, value: { email: EMAIL } });
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "super_admin.request_password_reset",
        outcome: "fail",
        error_code: "audit_rpc_failed",
        target_profile_id: PROFILE_ID,
      })
    );
  });

  it("logs a fail when the audit RPC returns no confirming uuid", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await superAdminRequestPasswordReset(
      undefined,
      form({ email: EMAIL, profile_id: PROFILE_ID })
    );

    expect(result).toEqual({ ok: true, value: { email: EMAIL } });
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: "audit_rpc_failed" })
    );
  });

  it("fails without calling the audit RPC when the reset email fails", async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      error: { message: "smtp down" },
    });

    const result = await superAdminRequestPasswordReset(
      undefined,
      form({ email: EMAIL, profile_id: PROFILE_ID })
    );

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
