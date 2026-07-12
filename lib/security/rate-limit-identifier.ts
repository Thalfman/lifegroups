import { createHmac } from "node:crypto";

export const IP_RATE_LIMIT_IDENTIFIER_VERSION = "ip:v1";

/** Normalize an infrastructure-supplied IP before it enters the HMAC. */
export function normalizeClientIp(ip: string): string | null {
  const trimmed = ip.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const unwrapped = trimmed.slice(1, -1).trim();
    return unwrapped || null;
  }
  return trimmed;
}

/**
 * Return the only representation of a client IP allowed in rate-limit stores.
 * The version prefix permits a deliberate secret/format rotation; rotating the
 * secret intentionally resets limiter history.
 */
export function createIpRateLimitIdentifier(
  ip: string,
  secret: string
): string {
  const normalizedIp = normalizeClientIp(ip);
  if (!normalizedIp) throw new Error("rate_limit_ip_required");

  const normalizedSecret = secret.trim();
  if (!normalizedSecret) {
    throw new Error("rate_limit_hmac_secret_required");
  }

  const digest = createHmac("sha256", normalizedSecret)
    .update(normalizedIp, "utf8")
    .digest("hex");
  return `${IP_RATE_LIMIT_IDENTIFIER_VERSION}:${digest}`;
}
