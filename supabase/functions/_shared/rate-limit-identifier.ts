export const IP_RATE_LIMIT_IDENTIFIER_VERSION = "ip:v1";

/** Keep this normalization byte-compatible with lib/security/rate-limit-identifier.ts. */
export function normalizeClientIp(ip: string): string | null {
  const trimmed = ip.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const unwrapped = trimmed.slice(1, -1).trim();
    return unwrapped || null;
  }
  return trimmed;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** Edge-runtime sibling of the Node HMAC identifier contract. */
export async function createIpRateLimitIdentifier(
  ip: string,
  secret: string
): Promise<string> {
  const normalizedIp = normalizeClientIp(ip);
  if (!normalizedIp) throw new Error("rate_limit_ip_required");

  const normalizedSecret = secret.trim();
  if (!normalizedSecret) {
    throw new Error("rate_limit_hmac_secret_required");
  }

  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(normalizedSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(normalizedIp)
  );
  return `${IP_RATE_LIMIT_IDENTIFIER_VERSION}:${bytesToHex(
    new Uint8Array(signature)
  )}`;
}
