// Stable, non-reversible identifiers for log correlation. Keeps PII (emails)
// out of structured log streams while letting operators correlate events that
// belong to the same actor across a request or short window.

const HASH_PREFIX_LEN = 12;

export function newCorrelationId(): string {
  return globalThis.crypto.randomUUID();
}

export async function hashEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const encoded = new TextEncoder().encode(normalized);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex.slice(0, HASH_PREFIX_LEN);
}
