// Stable, non-reversible identifiers for log correlation. Keeps PII (emails)
// out of structured log streams while letting operators correlate events that
// belong to the same actor across a request or short window.
//
// LOG_HASH_SALT is mixed into the email digest so a log dump on its own
// cannot be reversed via rainbow tables of common email addresses. The salt
// stays server-side; rotating it invalidates correlation across the rotation
// boundary, which is the intended privacy trade-off. When unset the hash is
// salt-less and a single warn line is emitted so the gap is visible in logs.

import { log } from "./logger";

const HASH_PREFIX_LEN = 12;

let unsaltedWarned = false;

function getSalt(): string {
  const s = process.env.LOG_HASH_SALT?.trim();
  if (s) return s;
  if (!unsaltedWarned) {
    unsaltedWarned = true;
    log.warn({
      event: "log_hash_salt_missing",
      route_or_action: "observability",
    });
  }
  return "";
}

export function newCorrelationId(): string {
  return globalThis.crypto.randomUUID();
}

export async function hashEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const salt = getSalt();
  const encoded = new TextEncoder().encode(`${salt}:${normalized}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex.slice(0, HASH_PREFIX_LEN);
}
