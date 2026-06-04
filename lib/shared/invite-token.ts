// Shareable invite-link tokens (Phase IL.1). The raw token is a 256-bit secret
// that lives only in the URL the super_admin copies; the database stores only
// its sha256 hash. Hashing is plain sha256 hex so it matches the Deno Web Crypto
// computation in supabase/functions/redeem-invite (no salt — the token itself is
// the secret, and a salt couldn't be shared with the public landing page).
import { createHash, randomBytes } from "crypto";

export function generateInviteToken(): string {
  // base64url keeps it URL-safe with no padding; 32 bytes = 256 bits of entropy.
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}
