// Defense-in-depth HTTP security headers, applied to every response by
// `next.config.ts`'s `headers()` block. RLS is the real access boundary; these
// headers are the belt-and-braces layer at the HTTP edge (clickjacking,
// MIME-sniffing, referrer leak, transport downgrade) for an app that handles
// sensitive pastoral-care data.
//
// The Content-Security-Policy is **enforcing** (#904; it shipped report-only
// first). It is the pragmatic variant — the
// decision record for each allowance:
//   - `style-src 'unsafe-inline'` + `script-src 'unsafe-inline' 'unsafe-eval'`:
//     Next injects inline styles and its runtime needs eval in dev; the three
//     shimmer-keyframe <style> blocks (components/*/lazy-*.tsx) also rely on
//     it. Tightening to a nonce-based strict policy is deliberate future work,
//     tracked with the design-debt burn-down (#908) — never widen beyond this.
//   - Supabase REST + Realtime (wss) origins in `connect-src`, derived from
//     the same env the server client reads.
//   - Vercel Analytics / Speed Insights script + beacon origins.
// No report endpoint was ever configured (violations only ever surfaced in the
// browser console), so the report-only soak was reviewed as: every observed
// source is allowlisted above and the a11y + E2E browser lanes run green under
// this exact policy. The builder is split out from next.config so its values
// are unit-testable.

// Relative (not the `@/` alias) on purpose: this module is imported by
// `next.config.ts`, whose transpile context resolves relative paths but not the
// tsconfig `@/*` alias.
import { getSupabaseUrlRaw } from "../env";

export type HttpHeader = { key: string; value: string };

// The third parties the app actually talks to, so the enforced CSP doesn't
// block legitimate traffic:
//   - the Supabase origin (REST + Realtime websocket) — derived at config time
//   - Vercel Analytics / Speed Insights (script host + vitals beacon)
const VERCEL_SCRIPT_ORIGIN = "https://va.vercel-scripts.com";
const VERCEL_VITALS_ORIGIN = "https://vitals.vercel-insights.com";

/**
 * Resolve the Supabase project origin (scheme + host) from the same env vars the
 * server client reads, so the CSP `connect-src` can allowlist its REST and
 * Realtime endpoints. Returns null when Supabase isn't configured (e.g. public
 * preview / CI builds) — the CSP then simply omits the Supabase entries.
 */
export function getSupabaseOrigin(): string | null {
  const url = getSupabaseUrlRaw();
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Build the Content-Security-Policy string (served enforcing). `'unsafe-inline'`
 * / `'unsafe-eval'` are accepted for v1 (Next ships inline styles and a
 * dev-time eval runtime); tightening via nonces is the future strict variant.
 */
export function buildContentSecurityPolicy(
  supabaseOrigin: string | null = getSupabaseOrigin()
): string {
  const supabaseConnect = supabaseOrigin
    ? [supabaseOrigin, supabaseOrigin.replace(/^https:/i, "wss:")]
    : [];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      VERCEL_SCRIPT_ORIGIN,
    ],
    "connect-src": [
      "'self'",
      ...supabaseConnect,
      VERCEL_SCRIPT_ORIGIN,
      VERCEL_VITALS_ORIGIN,
    ],
  };

  return Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(" ")}`)
    .join("; ");
}

/**
 * The full security header set applied to every route. CSP is enforcing.
 */
export function buildSecurityHeaders(
  supabaseOrigin: string | null = getSupabaseOrigin()
): HttpHeader[] {
  return [
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(supabaseOrigin),
    },
  ];
}
