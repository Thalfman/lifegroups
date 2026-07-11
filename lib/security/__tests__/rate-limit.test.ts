import { beforeEach, describe, expect, it, vi } from "vitest";

// The rate limiters cache their build result and their warn dedupe in
// module-level state, so each case re-imports a fresh module instance.

type FakeSlidingWindow = {
  maxRequests: number;
  window: string;
};

const { fakeLimiterBuckets } = vi.hoisted(() => ({
  fakeLimiterBuckets: new Map<string, number>(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class FakeRedis {},
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class FakeRatelimit {
    static slidingWindow(
      maxRequests: number,
      window: string
    ): FakeSlidingWindow {
      return { maxRequests, window };
    }

    private readonly prefix: string;
    private readonly maxRequests: number;

    constructor(input: { prefix: string; limiter: FakeSlidingWindow }) {
      this.prefix = input.prefix;
      this.maxRequests = input.limiter.maxRequests;
    }

    async limit(key: string): Promise<{ success: boolean }> {
      const bucketKey = `${this.prefix}:${key}`;
      const attempts = (fakeLimiterBuckets.get(bucketKey) ?? 0) + 1;
      fakeLimiterBuckets.set(bucketKey, attempts);
      return { success: attempts <= this.maxRequests };
    }
  },
}));

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

describe("invite-redeem null-IP fallback throttle (#858)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeLimiterBuckets.clear();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
  });

  it("allows a generous null-IP burst but denies attempts beyond the fallback cap", async () => {
    const { mod } = await freshModule();

    for (let attempt = 0; attempt < 50; attempt += 1) {
      await expect(mod.checkInviteRedeemLimit({ ip: null })).resolves.toEqual({
        configured: true,
        allowed: true,
      });
    }

    await expect(mod.checkInviteRedeemLimit({ ip: null })).resolves.toEqual({
      configured: true,
      allowed: false,
    });
  });

  it("keeps the resolved-IP 10-request bucket independent from exhausted fallback state", async () => {
    const { mod } = await freshModule();

    for (let attempt = 0; attempt < 51; attempt += 1) {
      await mod.checkInviteRedeemLimit({ ip: null });
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        mod.checkInviteRedeemLimit({ ip: "203.0.113.10" })
      ).resolves.toEqual({ configured: true, allowed: true });
    }
    await expect(
      mod.checkInviteRedeemLimit({ ip: "203.0.113.10" })
    ).resolves.toEqual({ configured: true, allowed: false });
  });

  it("logs a structured fallback dimension when the shared bucket denies", async () => {
    const { mod, warn } = await freshModule();

    for (let attempt = 0; attempt < 51; attempt += 1) {
      await mod.checkInviteRedeemLimit({
        ip: null,
        requestId: "req-fallback",
      });
    }

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith({
      event: "invite_redeem_throttled",
      outcome: "throttled",
      route_or_action: "invite-redeem",
      request_id: "req-fallback",
      dimension: "global_fallback",
    });
  });
});
