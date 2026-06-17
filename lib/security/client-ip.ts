import { headers } from "next/headers";

// Returns a client IP only when the deployment has explicitly declared
// which proxy header to trust via TRUSTED_PROXY. Otherwise returns null
// and the per-IP bucket is skipped — preventing both header spoofing (on
// self-hosted/direct-to-origin deploys where platform headers are
// attacker-controlled) and the cross-user shared-bucket DoS that would
// happen if every IP-less request hashed to the same key.
//
// Accepted values:
//   - "vercel"     -> trust x-vercel-forwarded-for
//   - "cloudflare" -> trust cf-connecting-ip
//   - "generic"    -> trust x-forwarded-for (first) then x-real-ip; only set
//                     this when the deployment terminates at a proxy that
//                     overwrites these headers.
//   - unset/other  -> no per-IP throttle (per-email throttle still applies)
export async function extractClientIp(): Promise<string | null> {
  const h = await headers();
  const trusted = process.env.TRUSTED_PROXY?.trim().toLowerCase();
  if (trusted === "vercel") {
    return h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || null;
  }
  if (trusted === "cloudflare") {
    return h.get("cf-connecting-ip")?.trim() || null;
  }
  if (trusted === "generic") {
    const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
    return h.get("x-real-ip")?.trim() || null;
  }
  return null;
}
