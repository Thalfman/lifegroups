import { beforeEach, describe, expect, it, vi } from "vitest";

// The rate limiters cache their build result and their warn dedupe in
// module-level state, so each case re-imports a fresh module instance.

type FakeSlidingWindow = {
  maxRequests: number;
  window: string;
};

const { fakeLimiterBuckets, failingLimiterPrefixes } = vi.hoisted(() => ({
  fakeLimiterBuckets: new Map<string, number>(),
  failingLimiterPrefixes: new Set<string>(),
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
      if (failingLimiterPrefixes.has(this.prefix)) {
        throw new Error("fake Redis outage");
      }
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
  return { mod, warn: vi.mocked(log.warn), error: vi.mocked(log.error) };
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
    vi.stubEnv("RATE_LIMIT_HMAC_SECRET", "test-rate-limit-hmac-secret");
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

  it("sends only a versioned HMAC identifier to the resolved-IP bucket", async () => {
    const { mod } = await freshModule();
    const rawIp = "203.0.113.42";

    await mod.checkInviteRedeemLimit({ ip: rawIp });

    const keys = [...fakeLimiterBuckets.keys()];
    expect(keys).toHaveLength(1);

    expect(keys[0]).toMatch(/^rl:invredeem:ip:ip:v1:[a-f0-9]{64}$/);
    expect(keys[0]).not.toContain(rawIp);
  });

  it("uses the shared fallback when an IP is present but the HMAC secret is missing", async () => {
    vi.stubEnv("RATE_LIMIT_HMAC_SECRET", "");
    const { mod } = await freshModule();

    await mod.checkInviteRedeemLimit({ ip: "203.0.113.42" });

    expect([...fakeLimiterBuckets.keys()]).toEqual([
      "rl:invredeem:fallback:global",
    ]);
  });
});

describe("forgot-password IP hashing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeLimiterBuckets.clear();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.stubEnv("RATE_LIMIT_HMAC_SECRET", "test-rate-limit-hmac-secret");
  });

  it("never sends the raw IP to Upstash", async () => {
    const { mod } = await freshModule();
    const rawIp = "203.0.113.9";

    await mod.checkForgotPasswordLimit({ ip: rawIp, emailHash: "email-hash" });

    const keys = [...fakeLimiterBuckets.keys()];
    expect(keys).toContain("rl:fp:em:email-hash");
    expect(keys.some((key) => /^rl:fp:ip:ip:v1:[a-f0-9]{64}$/.test(key))).toBe(
      true
    );
    expect(keys.every((key) => !key.includes(rawIp))).toBe(true);
  });
});

describe("login throttle (S-1, #895)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeLimiterBuckets.clear();
    failingLimiterPrefixes.clear();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.stubEnv("RATE_LIMIT_HMAC_SECRET", "test-rate-limit-hmac-secret");
  });

  it("reports unconfigured with a once-per-route warn when Upstash env is absent", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { mod, warn } = await freshModule();

    await expect(
      mod.checkLoginLimit({ ip: "203.0.113.1", emailHash: "h" })
    ).resolves.toEqual({ configured: false });
    await expect(
      mod.checkLoginLimit({ ip: "203.0.113.2", emailHash: "h" })
    ).resolves.toEqual({ configured: false });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "rate_limit_disabled",
        route_or_action: "login",
      })
    );
  });

  it("allows attempts under both buckets", async () => {
    const { mod } = await freshModule();

    await expect(
      mod.checkLoginLimit({ ip: "203.0.113.5", emailHash: "email-hash" })
    ).resolves.toEqual({ configured: true, allowed: true });
  });

  it("denies on the per-IP bucket after 20 attempts and reports which", async () => {
    const { mod } = await freshModule();

    // Distinct email hashes keep the email bucket clear so the 21st attempt
    // trips the IP window specifically.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expect(
        mod.checkLoginLimit({
          ip: "203.0.113.5",
          emailHash: `email-hash-${attempt}`,
        })
      ).resolves.toEqual({ configured: true, allowed: true });
    }

    await expect(
      mod.checkLoginLimit({ ip: "203.0.113.5", emailHash: "email-hash-final" })
    ).resolves.toEqual({ configured: true, allowed: false, which: "ip" });
  });

  it("denies on the per-email bucket after 8 attempts across distinct IPs", async () => {
    const { mod } = await freshModule();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await expect(
        mod.checkLoginLimit({
          ip: `203.0.113.${attempt + 1}`,
          emailHash: "email-hash",
        })
      ).resolves.toEqual({ configured: true, allowed: true });
    }

    await expect(
      mod.checkLoginLimit({ ip: "203.0.113.99", emailHash: "email-hash" })
    ).resolves.toEqual({ configured: true, allowed: false, which: "email" });
  });

  it("never sends the raw IP to Upstash", async () => {
    const { mod } = await freshModule();
    const rawIp = "203.0.113.77";

    await mod.checkLoginLimit({ ip: rawIp, emailHash: "email-hash" });

    const keys = [...fakeLimiterBuckets.keys()];
    expect(keys).toContain("rl:login:em:email-hash");
    expect(
      keys.some((key) => /^rl:login:ip:ip:v1:[a-f0-9]{64}$/.test(key))
    ).toBe(true);
    expect(keys.every((key) => !key.includes(rawIp))).toBe(true);
  });

  it("skips the IP bucket but keeps email enforcement when the HMAC secret is missing", async () => {
    vi.stubEnv("RATE_LIMIT_HMAC_SECRET", "");
    const { mod, warn } = await freshModule();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await expect(
        mod.checkLoginLimit({ ip: "203.0.113.5", emailHash: "email-hash" })
      ).resolves.toEqual({ configured: true, allowed: true });
    }
    await expect(
      mod.checkLoginLimit({ ip: "203.0.113.5", emailHash: "email-hash" })
    ).resolves.toEqual({ configured: true, allowed: false, which: "email" });

    expect([...fakeLimiterBuckets.keys()]).toEqual(["rl:login:em:email-hash"]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "rate_limit_disabled",
        route_or_action: "login-ip-hmac",
      })
    );
  });

  it("enforces the email bucket for null-IP callers", async () => {
    const { mod } = await freshModule();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await expect(
        mod.checkLoginLimit({ ip: null, emailHash: "email-hash" })
      ).resolves.toEqual({ configured: true, allowed: true });
    }
    await expect(
      mod.checkLoginLimit({ ip: null, emailHash: "email-hash" })
    ).resolves.toEqual({ configured: true, allowed: false, which: "email" });
  });

  it("fails open and logs a backend error when Redis throws", async () => {
    failingLimiterPrefixes.add("rl:login:ip");
    const { mod, error } = await freshModule();

    await expect(
      mod.checkLoginLimit({
        ip: "203.0.113.5",
        emailHash: "email-hash",
        requestId: "req-login-outage",
      })
    ).resolves.toEqual({ configured: true, allowed: true });

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "rate_limit_backend_error",
        outcome: "fail",
        route_or_action: "login",
        request_id: "req-login-outage",
      })
    );
  });
});

describe("public telemetry throttling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeLimiterBuckets.clear();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    failingLimiterPrefixes.clear();
    vi.stubEnv("RATE_LIMIT_HMAC_SECRET", "test-rate-limit-hmac-secret");
  });

  it("uses only a versioned HMAC in the endpoint-specific IP bucket", async () => {
    const { mod } = await freshModule();
    const rawIp = "198.51.100.8";

    await mod.checkPublicTelemetryLimit({
      endpoint: "vitals",
      ip: rawIp,
    });

    const keys = [...fakeLimiterBuckets.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^rl:telemetry:vitals:ip:ip:v1:[a-f0-9]{64}$/);
    expect(keys[0]).not.toContain(rawIp);
  });

  it("uses isolated 60-per-minute limits for each telemetry endpoint", async () => {
    const { mod } = await freshModule();
    const input = { ip: "198.51.100.8" };

    for (let attempt = 0; attempt < 60; attempt += 1) {
      await expect(
        mod.checkPublicTelemetryLimit({ endpoint: "vitals", ...input })
      ).resolves.toEqual({ configured: true, allowed: true });
    }
    await expect(
      mod.checkPublicTelemetryLimit({ endpoint: "vitals", ...input })
    ).resolves.toEqual({ configured: true, allowed: false });

    await expect(
      mod.checkPublicTelemetryLimit({ endpoint: "client-error", ...input })
    ).resolves.toEqual({ configured: true, allowed: true });
  });

  it("uses the bounded global fallback when no trusted IP is available", async () => {
    const { mod } = await freshModule();

    await mod.checkPublicTelemetryLimit({ endpoint: "client-error", ip: null });

    expect([...fakeLimiterBuckets.keys()]).toEqual([
      "rl:telemetry:client-error:fallback:global",
    ]);
  });

  it("does not put a raw IP in Redis when the HMAC secret is absent", async () => {
    vi.stubEnv("RATE_LIMIT_HMAC_SECRET", "");
    const { mod } = await freshModule();
    const rawIp = "198.51.100.8";

    await mod.checkPublicTelemetryLimit({
      endpoint: "client-error",
      ip: rawIp,
    });

    const keys = [...fakeLimiterBuckets.keys()];
    expect(keys).toEqual(["rl:telemetry:client-error:fallback:global"]);
    expect(keys.every((key) => !key.includes(rawIp))).toBe(true);
  });

  it("enforces a per-process IP limit when Upstash is unconfigured", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { mod } = await freshModule();
    const input = { endpoint: "vitals" as const, ip: "198.51.100.18" };

    for (let attempt = 0; attempt < 60; attempt += 1) {
      await expect(mod.checkPublicTelemetryLimit(input)).resolves.toEqual({
        configured: true,
        allowed: true,
      });
    }
    await expect(mod.checkPublicTelemetryLimit(input)).resolves.toEqual({
      configured: true,
      allowed: false,
    });
    expect(fakeLimiterBuckets).toHaveLength(0);
  });

  it("enforces the shared local cap when no trusted IP is available", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { mod } = await freshModule();
    const input = { endpoint: "client-error" as const, ip: null };

    for (let attempt = 0; attempt < 200; attempt += 1) {
      await expect(mod.checkPublicTelemetryLimit(input)).resolves.toMatchObject(
        {
          allowed: true,
        }
      );
    }
    await expect(mod.checkPublicTelemetryLimit(input)).resolves.toMatchObject({
      allowed: false,
    });
  });

  it("falls back to the bounded process limiter when Redis throws", async () => {
    failingLimiterPrefixes.add("rl:telemetry:vitals:ip");
    const { mod, error } = await freshModule();
    const input = { endpoint: "vitals" as const, ip: "198.51.100.28" };

    for (let attempt = 0; attempt < 60; attempt += 1) {
      await expect(mod.checkPublicTelemetryLimit(input)).resolves.toMatchObject(
        {
          allowed: true,
        }
      );
    }
    await expect(mod.checkPublicTelemetryLimit(input)).resolves.toMatchObject({
      allowed: false,
    });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "rate_limit_backend_error",
        route_or_action: "telemetry-vitals",
      })
    );
  });

  it("bounds and resets the per-process bucket store", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { mod } = await freshModule();

    for (
      let index = 0;
      index < mod.PUBLIC_TELEMETRY_LOCAL_MAX_BUCKETS + 10;
      index += 1
    ) {
      await mod.checkPublicTelemetryLimit({
        endpoint: "vitals",
        ip: `198.51.${Math.floor(index / 256)}.${index % 256}`,
      });
    }
    expect(mod.publicTelemetryLocalBucketCountForTests()).toBe(
      mod.PUBLIC_TELEMETRY_LOCAL_MAX_BUCKETS
    );

    mod.resetPublicTelemetryLocalLimitForTests();
    expect(mod.publicTelemetryLocalBucketCountForTests()).toBe(0);
  });
});
