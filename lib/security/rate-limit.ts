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
// wire credentials.

type LimiterPair = {
  ip: Ratelimit;
  email: Ratelimit;
};

let cached: LimiterPair | null | undefined;

function build(): LimiterPair | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  const redis = new Redis({ url, token });
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

export type ForgotPasswordLimitInput = {
  ip: string;
  emailHash: string;
  requestId?: string;
};

export type ForgotPasswordLimitResult =
  | { configured: false }
  | { configured: true; allowed: true }
  | { configured: true; allowed: false; which: "ip" | "email" };

export async function checkForgotPasswordLimit(
  input: ForgotPasswordLimitInput,
): Promise<ForgotPasswordLimitResult> {
  const limiters = getLimiters();
  if (!limiters) {
    log.warn({
      event: "rate_limit_disabled",
      route_or_action: "forgot-password",
      request_id: input.requestId,
    });
    return { configured: false };
  }

  const [ipRes, emailRes] = await Promise.all([
    limiters.ip.limit(input.ip),
    limiters.email.limit(input.emailHash),
  ]);

  if (!ipRes.success) return { configured: true, allowed: false, which: "ip" };
  if (!emailRes.success) return { configured: true, allowed: false, which: "email" };
  return { configured: true, allowed: true };
}
