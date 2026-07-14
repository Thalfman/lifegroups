import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { log } from "@/lib/observability/logger";
import { createIpRateLimitIdentifier } from "@/lib/security/rate-limit-identifier";

// Forgot-password rate limits. Two sliding windows enforced per request:
//   - per-IP:    5 requests / 15 min (protects against bulk enumeration)
//   - per-email: 3 requests / 15 min (caps abuse against a single account)
//
// When Upstash env vars are missing the limiter is null and callers proceed
// without enforcement — the local-dev experience stays frictionless and a
// `rate_limit_disabled` warn line surfaces in deployments that forgot to
// wire credentials. Upstash backend failures are caught and fail open so
// password-reset stays available; a `rate_limit_backend_error` line is
// emitted for ops visibility.
//
// Forgot-password callers with no trusted client IP skip only the IP bucket;
// its email bucket still provides enforcement. Invite-redeem has no secondary
// identity dimension, so null-IP calls use a generous shared fallback bucket
// instead of bypassing throttling entirely.

type LimiterPair = {
  ip: Ratelimit;
  email: Ratelimit;
};

let cached: LimiterPair | null | undefined;
// Once-per-process dedupe, keyed by route_or_action so each unconfigured
// limiter reports itself exactly once — a shared boolean would let whichever
// route is hit first suppress the other's warning (#856).
const disabledWarnedRoutes = new Set<string>();

function warnDisabledOnce(routeOrAction: string, requestId?: string): void {
  if (disabledWarnedRoutes.has(routeOrAction)) return;
  disabledWarnedRoutes.add(routeOrAction);
  log.warn({
    event: "rate_limit_disabled",
    route_or_action: routeOrAction,
    request_id: requestId,
  });
}

// One place that reads the Upstash credentials and builds the client; returns
// null when the env vars are absent so callers fall open. Shared by both the
// forgot-password and invite-redeem limiters.
function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function getHmacSecret(): string | null {
  return process.env.RATE_LIMIT_HMAC_SECRET?.trim() || null;
}

function ipIdentifier(ip: string, secret: string): string {
  return createIpRateLimitIdentifier(ip, secret);
}

function build(): LimiterPair | null {
  const redis = getRedis();
  if (!redis) return null;
  return {
    ip: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "rl:fp:ip",
      analytics: false,
    }),
    email: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "15 m"),
      prefix: "rl:fp:em",
      analytics: false,
    }),
  };
}

function getLimiters(): LimiterPair | null {
  if (cached === undefined) cached = build();
  return cached;
}

// Invite-redeem limiters (Phase IL.1). A separate per-IP sliding window guards
// the public /invite redemption endpoint against token brute-forcing and mass
// self-signup. Lazily built and cached like the forgot-password pair; shares
// the same Upstash credentials and the same fail-open posture.
type InviteRedeemLimiters = {
  ip: Ratelimit;
  fallback: Ratelimit;
};

const INVITE_REDEEM_FALLBACK_KEY = "global";

let cachedRedeem: InviteRedeemLimiters | null | undefined;

function buildRedeemLimiters(): InviteRedeemLimiters | null {
  const redis = getRedis();
  if (!redis) return null;
  return {
    ip: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "15 m"),
      prefix: "rl:invredeem:ip",
      analytics: false,
    }),
    // Trusted-proxy resolution failures should be rare. Fifty attempts per
    // 15 minutes leaves room for legitimate shared traffic while bounding an
    // otherwise-unlimited token-guessing stream.
    fallback: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(50, "15 m"),
      prefix: "rl:invredeem:fallback",
      analytics: false,
    }),
  };
}

export type InviteRedeemLimitInput = {
  ip: string | null;
  requestId?: string;
};

export type InviteRedeemLimitResult =
  | { configured: false }
  | { configured: true; allowed: boolean };

export async function checkInviteRedeemLimit(
  input: InviteRedeemLimitInput
): Promise<InviteRedeemLimitResult> {
  if (cachedRedeem === undefined) cachedRedeem = buildRedeemLimiters();
  const limiters = cachedRedeem;
  if (!limiters) {
    warnDisabledOnce("invite-redeem", input.requestId);
    return { configured: false };
  }

  const hmacSecret = getHmacSecret();
  const hashedIp =
    input.ip !== null && hmacSecret !== null
      ? ipIdentifier(input.ip, hmacSecret)
      : null;
  if (input.ip !== null && hmacSecret === null) {
    warnDisabledOnce("invite-redeem-ip-hmac", input.requestId);
  }
  const usesFallback = hashedIp === null;
  const limiter = usesFallback ? limiters.fallback : limiters.ip;
  const key = hashedIp ?? INVITE_REDEEM_FALLBACK_KEY;
  try {
    const res = await limiter.limit(key);
    if (usesFallback && !res.success) {
      log.warn({
        event: "invite_redeem_throttled",
        outcome: "throttled",
        route_or_action: "invite-redeem",
        request_id: input.requestId,
        dimension: "global_fallback",
      });
    }
    return { configured: true, allowed: res.success };
  } catch (err) {
    log.error({
      event: "rate_limit_backend_error",
      outcome: "fail",
      route_or_action: "invite-redeem",
      request_id: input.requestId,
      error_message: err instanceof Error ? err.message : String(err),
    });
    return { configured: true, allowed: true };
  }
}

export type PublicTelemetryEndpoint = "client-error" | "vitals";

type PublicTelemetryLimiterPair = {
  ip: Ratelimit;
  fallback: Ratelimit;
};

type PublicTelemetryLimiters = Record<
  PublicTelemetryEndpoint,
  PublicTelemetryLimiterPair
>;

let cachedPublicTelemetry: PublicTelemetryLimiters | null | undefined;
const PUBLIC_TELEMETRY_WINDOW_MS = 60_000;
const PUBLIC_TELEMETRY_IP_LIMIT = 60;
const PUBLIC_TELEMETRY_GLOBAL_LIMIT = 200;
export const PUBLIC_TELEMETRY_LOCAL_MAX_BUCKETS = 2_048;

type PublicTelemetryLocalBucket = {
  count: number;
  resetAt: number;
};

const publicTelemetryLocalBuckets = new Map<
  string,
  PublicTelemetryLocalBucket
>();

function checkPublicTelemetryLocalLimit(
  endpoint: PublicTelemetryEndpoint,
  identifier: string | null,
  now = Date.now()
): boolean {
  const dimension = identifier === null ? "global" : "ip";
  const key = `${endpoint}:${dimension}:${identifier ?? "global"}`;
  const limit =
    identifier === null
      ? PUBLIC_TELEMETRY_GLOBAL_LIMIT
      : PUBLIC_TELEMETRY_IP_LIMIT;
  const current = publicTelemetryLocalBuckets.get(key);
  const bucket =
    current && current.resetAt > now
      ? { count: current.count + 1, resetAt: current.resetAt }
      : { count: 1, resetAt: now + PUBLIC_TELEMETRY_WINDOW_MS };

  if (
    !current &&
    publicTelemetryLocalBuckets.size >= PUBLIC_TELEMETRY_LOCAL_MAX_BUCKETS
  ) {
    for (const [candidateKey, candidate] of publicTelemetryLocalBuckets) {
      if (candidate.resetAt <= now) {
        publicTelemetryLocalBuckets.delete(candidateKey);
      }
    }
    while (
      publicTelemetryLocalBuckets.size >= PUBLIC_TELEMETRY_LOCAL_MAX_BUCKETS
    ) {
      const oldestKey = publicTelemetryLocalBuckets.keys().next().value;
      if (oldestKey === undefined) break;
      publicTelemetryLocalBuckets.delete(oldestKey);
    }
  }

  // Refresh insertion order for bounded least-recently-used eviction.
  publicTelemetryLocalBuckets.delete(key);
  publicTelemetryLocalBuckets.set(key, bucket);
  return bucket.count <= limit;
}

export function resetPublicTelemetryLocalLimitForTests(): void {
  publicTelemetryLocalBuckets.clear();
  cachedPublicTelemetry = undefined;
}

export function publicTelemetryLocalBucketCountForTests(): number {
  return publicTelemetryLocalBuckets.size;
}

function buildPublicTelemetryLimiters(): PublicTelemetryLimiters | null {
  const redis = getRedis();
  if (!redis) return null;

  const pair = (prefix: string): PublicTelemetryLimiterPair => ({
    ip: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: `${prefix}:ip`,
      analytics: false,
    }),
    fallback: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(200, "1 m"),
      prefix: `${prefix}:fallback`,
      analytics: false,
    }),
  });

  return {
    "client-error": pair("rl:telemetry:client-error"),
    vitals: pair("rl:telemetry:vitals"),
  };
}

export type PublicTelemetryLimitInput = {
  endpoint: PublicTelemetryEndpoint;
  ip: string | null;
  requestId?: string;
};

export type PublicTelemetryLimitResult = { configured: true; allowed: boolean };

// The public telemetry routes have no authenticated identity. Redis provides
// the distributed limiter when available; a bounded per-process fixed window
// keeps both routes limited when Redis is absent or fails. Both paths use only
// a versioned HMAC of a trusted IP, or the shared no-IP bucket. Raw IPs never
// enter limiter keys or logs.
export async function checkPublicTelemetryLimit(
  input: PublicTelemetryLimitInput
): Promise<PublicTelemetryLimitResult> {
  if (cachedPublicTelemetry === undefined) {
    cachedPublicTelemetry = buildPublicTelemetryLimiters();
  }
  const hmacSecret = getHmacSecret();
  const hashedIp =
    input.ip !== null && hmacSecret !== null
      ? ipIdentifier(input.ip, hmacSecret)
      : null;
  const limiters = cachedPublicTelemetry;
  const routeOrAction = `telemetry-${input.endpoint}`;
  const dimension = hashedIp === null ? "global_fallback" : "ip_hmac";
  const checkLocal = (): PublicTelemetryLimitResult => ({
    configured: true,
    allowed: checkPublicTelemetryLocalLimit(input.endpoint, hashedIp),
  });
  const usesFallback = hashedIp === null;

  if (input.ip !== null && hmacSecret === null) {
    warnDisabledOnce(`${routeOrAction}-ip-hmac`, input.requestId);
  }

  if (!limiters) {
    warnDisabledOnce(routeOrAction, input.requestId);
    const localResult = checkLocal();
    if (!localResult.allowed) {
      log.warn({
        event: "public_telemetry_throttled",
        outcome: "throttled",
        route_or_action: routeOrAction,
        request_id: input.requestId,
        dimension,
      });
    }
    return localResult;
  }

  const limiterPair = limiters[input.endpoint];
  const limiter = usesFallback ? limiterPair.fallback : limiterPair.ip;

  try {
    const result = await limiter.limit(hashedIp ?? "global");
    if (!result.success) {
      log.warn({
        event: "public_telemetry_throttled",
        outcome: "throttled",
        route_or_action: routeOrAction,
        request_id: input.requestId,
        dimension,
      });
    }
    return { configured: true, allowed: result.success };
  } catch (err) {
    log.error({
      event: "rate_limit_backend_error",
      outcome: "fail",
      route_or_action: routeOrAction,
      request_id: input.requestId,
      error_message: err instanceof Error ? err.message : String(err),
    });
    const localResult = checkLocal();
    if (!localResult.allowed) {
      log.warn({
        event: "public_telemetry_throttled",
        outcome: "throttled",
        route_or_action: routeOrAction,
        request_id: input.requestId,
        dimension,
      });
    }
    return localResult;
  }
}

export type ForgotPasswordLimitInput = {
  ip: string | null;
  emailHash: string;
  requestId?: string;
};

export type ForgotPasswordLimitResult =
  | { configured: false }
  | { configured: true; allowed: true }
  | { configured: true; allowed: false; which: "ip" | "email" };

export async function checkForgotPasswordLimit(
  input: ForgotPasswordLimitInput
): Promise<ForgotPasswordLimitResult> {
  const limiters = getLimiters();
  if (!limiters) {
    warnDisabledOnce("forgot-password", input.requestId);
    return { configured: false };
  }

  try {
    const hmacSecret = getHmacSecret();
    const hashedIp =
      input.ip !== null && hmacSecret !== null
        ? ipIdentifier(input.ip, hmacSecret)
        : null;
    if (input.ip !== null && hmacSecret === null) {
      warnDisabledOnce("forgot-password-ip-hmac", input.requestId);
    }
    const ipPromise = hashedIp
      ? limiters.ip.limit(hashedIp)
      : Promise.resolve({ success: true });
    const [ipRes, emailRes] = await Promise.all([
      ipPromise,
      limiters.email.limit(input.emailHash),
    ]);

    if (hashedIp && !ipRes.success) {
      return { configured: true, allowed: false, which: "ip" };
    }
    if (!emailRes.success) {
      return { configured: true, allowed: false, which: "email" };
    }
    return { configured: true, allowed: true };
  } catch (err) {
    // Fail open: a Redis outage or rotated token must not take down the
    // password-reset path. Emit a structured event so ops can react.
    log.error({
      event: "rate_limit_backend_error",
      outcome: "fail",
      route_or_action: "forgot-password",
      request_id: input.requestId,
      error_message: err instanceof Error ? err.message : String(err),
    });
    return { configured: true, allowed: true };
  }
}
