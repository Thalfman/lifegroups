import { headers } from "next/headers";

// Resolve the public origin (scheme + host, no trailing slash) for building
// links that must work outside the current request — e.g. invite/redirect URLs
// embedded in emails. Prefer the explicitly configured site URL (stable across
// proxies); fall back to the request's forwarded host so local/dev still
// produces a working link. Returns null when neither can be determined.
//
// Single source of truth shared by the super-admin invite actions so the
// redirect target is resolved the same way everywhere (the password-recovery
// flow resolves it the same way in app/forgot-password/actions.ts).
export async function resolveSiteOrigin(): Promise<string | null> {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
