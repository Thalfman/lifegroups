import { beforeEach, describe, expect, it, vi } from "vitest";

// The rate limiters cache their build result and their warn dedupe in
// module-level state, so each case re-imports a fresh module instance.

vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function freshModule() {
  vi.resetModules();
  const mod = await import("@/lib/security/rate-limit");
  const { log } = await import("@/lib/observability/logger");
  return { mod, warn: vi.mocked(log.warn) };
}

describe("rate_limit_disabled warning dedupe (#856)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No Upstash credentials: both limiters are unconfigured.
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  });

  it("warns once per route, not once per process", async () => {
    const { mod, warn } = await freshModule();

    await mod.checkInviteRedeemLimit({ ip: "203.0.113.1" });
    await mod.checkForgotPasswordLimit({ ip: "203.0.113.1", emailHash: "h" });

    expect(warn).toHaveBeenCalledTimes(2);
    const routes = warn.mock.calls.map(
      (call) => (call[0] as { route_or_action?: string }).route_or_action
    );
    expect(routes).toEqual(["invite-redeem", "forgot-password"]);
    expect(
      warn.mock.calls.every(
        (call) =>
          (call[0] as { event?: string }).event === "rate_limit_disabled"
      )
    ).toBe(true);
  });

  it("warns once per route in the reverse hit order too", async () => {
    const { mod, warn } = await freshModule();

    await mod.checkForgotPasswordLimit({ ip: null, emailHash: "h" });
    await mod.checkInviteRedeemLimit({ ip: null });

    const routes = warn.mock.calls.map(
      (call) => (call[0] as { route_or_action?: string }).route_or_action
    );
    expect(routes).toEqual(["forgot-password", "invite-redeem"]);
  });

  it("keeps the once-per-process semantics for repeated hits to one route", async () => {
    const { mod, warn } = await freshModule();

    await mod.checkInviteRedeemLimit({ ip: "203.0.113.1" });
    await mod.checkInviteRedeemLimit({ ip: "203.0.113.2" });
    await mod.checkInviteRedeemLimit({ ip: null });

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("reports both limiters as unconfigured", async () => {
    const { mod } = await freshModule();

    await expect(
      mod.checkInviteRedeemLimit({ ip: "203.0.113.1" })
    ).resolves.toEqual({ configured: false });
    await expect(
      mod.checkForgotPasswordLimit({ ip: "203.0.113.1", emailHash: "h" })
    ).resolves.toEqual({ configured: false });
  });
});
