import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { log } from "@/lib/observability/logger";

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
// When the caller cannot determine a client IP (no trusted forwarded
// header present) it passes `ip: null` so the per-IP bucket is skipped,
// preventing all `unknown`-keyed callers from sharing a single bucket and
// throttling each other (a cross-user denial of service).

type LimiterPair = {
  ip: Ratelimit;
  email: Ratelimit;
};

let cached: LimiterPair | null | undefined;
let disabledWarned = false;

// One place that reads the Upstash credentials and builds the client; returns
// null when the env vars are absent so callers fall open. Shared by both the
// forgot-password and invite-redeem limiters.
function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return new Redis({ url, token });
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

// Invite-redeem limiter (Phase IL.1). A separate per-IP sliding window guards
// the public /invite redemption endpoint against token brute-forcing and mass
// self-signup. Lazily built and cached like the forgot-password pair; shares
// the same Upstash credentials and the same fail-open posture.
let cachedRedeem: Ratelimit | null | undefined;

function buildRedeemLimiter(): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "15 m"),
    prefix: "rl:invredeem:ip",
    analytics: false,
  });
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
  if (cachedRedeem === undefined) cachedRedeem = buildRedeemLimiter();
  const limiter = cachedRedeem;
  if (!limiter) {
    if (!disabledWarned) {
      disabledWarned = true;
      log.warn({
        event: "rate_limit_disabled",
        route_or_action: "invite-redeem",
        request_id: input.requestId,
      });
    }
    return { configured: false };
  }
  // No IP available (untrusted proxy header) -> skip the per-IP bucket rather
  // than collapse every caller into one shared key.
  if (!input.ip) return { configured: true, allowed: true };
  try {
    const res = await limiter.limit(input.ip);
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
    if (!disabledWarned) {
      disabledWarned = true;
      log.warn({
        event: "rate_limit_disabled",
        route_or_action: "forgot-password",
        request_id: input.requestId,
      });
    }
    return { configured: false };
  }

  try {
    const ipPromise = input.ip
      ? limiters.ip.limit(input.ip)
      : Promise.resolve({ success: true });
    const [ipRes, emailRes] = await Promise.all([
      ipPromise,
      limiters.email.limit(input.emailHash),
    ]);

    if (input.ip && !ipRes.success) {
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
